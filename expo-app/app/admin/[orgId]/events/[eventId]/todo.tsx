import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Event } from '@sk/shared';
import { ScreenHeader } from '../../../../../components/ScreenHeader';
import { AccessDenied } from '../../../../../components/AccessDenied';
import { PageBody } from '../../../../../components/PageBody';
import CustomSelect from '../../../../../components/CustomSelect';
import { SegmentedControl } from '../../../../../components/SegmentedControl';
import { SectionPageHeading } from '../../../../../components/tournament/TournamentBits';
import { TodoRow, TodoRows, useTournamentTodo } from '../../../../../components/tournament/TournamentTodo';
import { useTournamentData } from '../../../../../hooks/useTournamentData';
import { useSafeBack } from '../../../../../hooks/useSafeBack';

/**
 * A tournament's To do as a page of its own — the Overview card's *See all ›* (agreed 2026-10-18,
 * `FIX-24`; `mockups/tournament-participant.html`). Everything the viewer's organisation still owes:
 * the viewer's own first, then its coaches', each line as on the card, with filters for whose it is,
 * the sport and the team.
 */
export default function TournamentTodoScreen() {
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
        <ScreenHeader title="To do" onBack={backToTournament} backLabel="Overview" />
        <View className="flex-1 items-center justify-center p-6"><ActivityIndicator /></View>
      </SafeAreaView>
    );
  }
  return <TodoPage orgId={orgId} event={data.event} data={data} onBack={backToTournament} />;
}

type Whose = 'all' | 'mine' | 'coaches';
const ALL = 'all';

function TodoPage({ orgId, event, data, onBack }: {
  orgId: string;
  event: Event;
  data: ReturnType<typeof useTournamentData>;
  onBack: () => void;
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const { divisions, entrants, canEdit, sports } = data;
  const { tasks } = useTournamentTodo({ event, divisions, entrants, canEdit, sports });
  const [whose, setWhose] = useState<Whose>('all');
  const [sportId, setSportId] = useState<string>(ALL);
  const [team, setTeam] = useState<string>(ALL);

  // On the page every team is its own line, so each can be found and filtered.
  const rows: TodoRow[] = useMemo(() => tasks.map(t => ({ key: t.key, tasks: [t], mine: t.mine })), [tasks]);
  const teamKey = (r: TodoRow) => `${r.tasks[0].divisionName} ${r.tasks[0].teamName}`;
  const sportsHere = [...new Set(rows.map(r => r.tasks[0].sportId || ''))];
  const inSport = rows.filter(r => sportId === ALL || r.tasks[0].sportId === sportId);
  const teamsHere = [...new Set(inSport.map(teamKey))];
  const shown = inSport.filter(r => (whose === 'all' || (whose === 'mine') === r.mine) && (team === ALL || teamKey(r) === team));
  const hasCoaches = rows.some(r => !r.mine);
  const orgName = (id?: string) => event.participatingOrgs?.find(o => o.id === id)?.name || 'Your organisation';
  const group = (title: string, list: TodoRow[]) => list.length ? (
    <View className="gap-1">
      {hasCoaches ? <Text className="font-orbitron-bold text-[10px] tracking-widest uppercase text-ink-muted mt-2">{title}</Text> : null}
      <TodoRows
        rows={list}
        orgId={orgId}
        eventName={event.name}
        orgName={orgName}
        onAnswerEach={pid => router.push(`/admin/${orgId}/events/${event.id}/organisations/${pid}` as any)}
        showWhose
      />
    </View>
  ) : null;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <ScreenHeader title="To do" context={event.name} onBack={onBack} backLabel="Overview" />
      <ScrollView contentContainerStyle={{ padding: isWide ? 24 : 12, paddingBottom: 80 }}>
        <PageBody className="gap-3">
          <SectionPageHeading title="To do" count={rows.length} phone={!isWide} />
          <View className="rounded-2xl border border-line bg-card p-4 gap-3">
            <Text className="font-inter text-[13px] text-ink-muted">
              Everything still to do for {event.name}{hasCoaches ? ' — yours first, then your coaches’' : ''}.
            </Text>
            {rows.length > 1 ? (
              <View className={isWide ? 'flex-row flex-wrap items-center gap-2' : 'gap-2'}>
                {hasCoaches ? (
                  <SegmentedControl<Whose>
                    fit
                    isCompact
                    value={whose}
                    onChange={setWhose}
                    options={[{ key: 'all', label: 'All' }, { key: 'mine', label: 'Yours' }, { key: 'coaches', label: 'Coaches’' }]}
                  />
                ) : null}
                {sportsHere.length > 1 ? (
                  <CustomSelect
                    compact
                    accessibilityLabel="Sport"
                    placeholder="Sport"
                    value={sportId}
                    onChange={id => { setSportId(id); setTeam(ALL); }}
                    options={[{ value: ALL, label: 'All sports' }, ...sportsHere.map(id => ({ value: id, label: sports.find(s => s.id === id)?.name || 'Other' }))]}
                  />
                ) : null}
                {teamsHere.length > 1 ? (
                  <CustomSelect
                    compact
                    accessibilityLabel="Team"
                    placeholder="Team"
                    value={team}
                    onChange={setTeam}
                    options={[{ value: ALL, label: 'All teams' }, ...teamsHere.map(t => ({ value: t, label: t }))]}
                  />
                ) : null}
                <Text className="font-inter text-xs text-ink-muted">{shown.length} of {rows.length}</Text>
              </View>
            ) : null}
            {shown.length ? (
              <>
                {group('Yours', shown.filter(r => r.mine))}
                {group('Coaches’', shown.filter(r => !r.mine))}
              </>
            ) : (
              <Text className="font-inter text-sm text-ink-muted">{rows.length ? 'Nothing here with these filters.' : 'Nothing to do.'}</Text>
            )}
          </View>
        </PageBody>
      </ScrollView>
    </SafeAreaView>
  );
}
