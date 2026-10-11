import React, { useRef } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Event } from '@sk/shared';
import { ScreenHeader } from '../../../../../components/ScreenHeader';
import { AccessDenied } from '../../../../../components/AccessDenied';
import { useShowFieldHelp } from '../../../../../components/FieldLabel';
import { ChipCarousel, SectionPageHeading, SportBlock, SportChip } from '../../../../../components/tournament/TournamentBits';
import { useSportsSection } from '../../../../../components/tournament/TournamentSections';
import { useTournamentSteps } from '../../../../../components/tournament/TournamentHome';
import { useTournamentData } from '../../../../../hooks/useTournamentData';
import { useSafeBack } from '../../../../../hooks/useSafeBack';
import { PageBody } from '../../../../../components/PageBody';
import { LAYOUT } from '../../../../../constants/layout';

/**
 * Sports & divisions as a page of its own — the Overview card's *See all ›* (agreed 2026-10-09 on
 * `mockups/tournament-cards.html`). The same things the card shows, shown the same way, with more
 * room: every sport at once rather than one at a time, each exactly as the card shows its chosen
 * one. The sport chips stay at the top, pinned as the page scrolls, and jump to a sport rather than
 * switch. The heading is the card's, larger, with its status while the tournament is being set up.
 */
export default function TournamentSportsScreen() {
  const { orgId, eventId } = useLocalSearchParams<{ orgId: string; eventId: string }>();
  const safeBack = useSafeBack();
  const backToTournament = () => safeBack(`/admin/${orgId}/events/${eventId}`);
  const data = useTournamentData(orgId, eventId);

  if (data.accessDenied) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <AccessDenied message="This tournament is not open to you." actionLabel="Back" onAction={backToTournament} />
      </SafeAreaView>
    );
  }
  if (!data.event) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <ScreenHeader title="Sports & divisions" onBack={backToTournament} backLabel="Overview" />
        <View className="flex-1 items-center justify-center p-6"><ActivityIndicator /></View>
      </SafeAreaView>
    );
  }
  return <SportsPage orgId={orgId} event={data.event} data={data} onBack={backToTournament} />;
}

/** The page itself, once the event is here — its own component, so the section's hooks always run. */
function SportsPage({ orgId, event, data, onBack }: {
  orgId: string;
  event: Event;
  data: ReturnType<typeof useTournamentData>;
  onBack: () => void;
}) {
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const showHelp = useShowFieldHelp();
  const { divisions, games, entrants, entrantsByDivision, facilityIds, sports, sites, canEdit } = data;
  const { steps, complete } = useTournamentSteps({ event, divisions, games, entrants, entrantsByDivision, facilityIds, sports, sites });
  const setupMode = canEdit && !complete;
  const section = useSportsSection({ event, orgId, sports, divisions, games, entrantsByDivision, canEdit, setupMode, complete, mySportIds: data.capabilities?.convenesSportIds || [] });
  const sportIds = event.sportIds || [];
  const divisionsOf = (id: string) => divisions.filter(d => d.sportId === id);

  /* Jumping to a sport: where the list starts in the scroll, and each sport within it, less the
     pinned chips above. */
  const scrollRef = useRef<ScrollView>(null);
  const listY = useRef(0);
  const chipsH = useRef(0);
  const sportY = useRef<Record<string, number>>({});
  const jumpTo = (sportId: string) =>
    scrollRef.current?.scrollTo({ y: Math.max(0, listY.current + (sportY.current[sportId] ?? 0) - chipsH.current - 8), animated: true });

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <ScreenHeader title="Sports & divisions" context={event.name} onBack={onBack} backLabel="Overview" />
      {/* Three children, always: the heading, the pinned chips, the sports. `stickyHeaderIndices`
          counts children by position, so none of them may be conditional. */}
      <ScrollView ref={scrollRef} stickyHeaderIndices={[1]} contentContainerStyle={{ padding: isWide ? 24 : 12, paddingBottom: 80 }}>
        <PageBody className="gap-3 pb-3">
          <SectionPageHeading
            title="Sports & divisions"
            count={divisions.length}
            status={setupMode ? steps.find(s => s.key === 'divisions')?.state ?? null : null}
            phone={!isWide}
            right={section.addSport ? (
              <TouchableOpacity onPress={section.addSport} accessibilityRole="button" className="rounded-xl border border-line bg-card px-3.5 py-2">
                <Text className="font-inter-bold text-[13px] text-ink">＋ Add a sport</Text>
              </TouchableOpacity>
            ) : null}
          />
          {(setupMode ? showHelp : true) ? (
            <Text className="font-inter text-[13px] text-ink-muted leading-relaxed" style={{ maxWidth: LAYOUT.formMaxWidth }}>
              {setupMode ? (
                <>
                  <Text className="font-inter-semibold text-ink-soft">Choose the sports being played, then the divisions within each. </Text>
                  A division is a group of teams that compete against each other — usually an age group, e.g. Rugby U16. Each division has its own draw and table, and teams are entered into a division. A sport can have one division or several.
                </>
              ) : 'A division is a group of teams that compete against each other — usually an age group, e.g. Rugby U16.'}
            </Text>
          ) : null}
        </PageBody>

        <View className="bg-canvas py-2" onLayout={e => { chipsH.current = e.nativeEvent.layout.height; }}>
          <PageBody>
            {sportIds.length ? (
              <ChipCarousel>
                {sportIds.map(id => (
                  <SportChip key={id} name={section.sportName(id)} count={divisionsOf(id).length} on={false} dot={section.attention(id)} onPress={() => jumpTo(id)} />
                ))}
              </ChipCarousel>
            ) : null}
          </PageBody>
        </View>

        <PageBody className="gap-4 pt-2" onLayout={e => { listY.current = e.nativeEvent.layout.y; }}>
          {sportIds.length ? sportIds.map(id => (
            <View key={id} onLayout={e => { sportY.current[id] = e.nativeEvent.layout.y; }} className="rounded-2xl border border-line bg-card p-4">
              <SportBlock
                sportId={id}
                sportName={section.sportName(id)}
                divisions={divisionsOf(id)}
                entrantsByDivision={entrantsByDivision}
                divisionState={section.divisionState}
                onOpenDivision={section.openDivision}
                onAddDivision={section.addDivision}
                canAddDivision={section.canAddDivision}
                sportMenu={section.sportMenu}
              />
            </View>
          )) : (
            <View className="rounded-2xl border border-line bg-card p-4 gap-1">
              <Text className="font-inter text-[13px] text-ink-muted">No sports yet. Choose the sports being played — each gets its first division straight away.</Text>
              {canEdit ? (
                <TouchableOpacity onPress={section.chooseSports} accessibilityRole="button" className="self-start py-1">
                  <Text className="font-inter-bold text-[13px] text-primary-ink">＋ Add a sport</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        </PageBody>
      </ScrollView>
      {section.dialogs}
    </SafeAreaView>
  );
}
