import React, { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Facility,
  GameSummary,
  SocketAction,
  TournamentEntrant,
  TournamentStage,
  isPlayedFixture,
} from '@sk/shared';
import { EditDialog } from '../EditDialog';
import { SegmentedControl } from '../SegmentedControl';
import { FixtureSideFitted, RowTag, fixtureSideNames, sideScores } from '../events/EventBits';
import { TournamentCard } from './TournamentBits';
import { FormatSetting, drawSummary, formatDetail } from './DivisionDialogs';
import { sendAction } from '../../services/actions';
import { formatFixtureWhen } from '../../utils/dates';

/**
 * The division page's fixtures card (`FIX-27`, docs/events.md §8): *The draw* until there is one,
 * then *Fixtures*.
 *
 * **The draw** is offered once there are two teams and the division is not set by hand
 * (`Festival`). **Redo the draw** replaces the fixtures — only until a game has started: from then
 * on fixtures change by hand (the server refuses the same, `assertDivisionNotStarted`). A later
 * stage — the knockout after pools — gets its own *Make the draw* once it is reached, which is not
 * a redraw.
 */

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const SHOWN = 8;

export function DivisionFixturesCard({ orgId, eventId, divisionId, stages, games, entrants, format, facilities, canEdit, started, pendingTeams, isWide, ownOrgId, dialog: dialogProp, onDialog }: {
  orgId: string;
  eventId: string;
  divisionId: string;
  stages: TournamentStage[];
  /** The division's fixtures. */
  games: GameSummary[];
  /** The division's roster, withdrawn teams included. */
  entrants: TournamentEntrant[];
  format: FormatSetting | null;
  facilities: Facility[];
  canEdit: boolean;
  /** A game in the division is live or finished. */
  started: boolean;
  /** Teams whose organisation has not accepted yet — said when the draw is made. */
  pendingTeams: TournamentEntrant[];
  isWide: boolean;
  /** Our own organisation, whose teams are named without it. */
  ownOrgId?: string;
  /** Make the draw and Redo the draw may be opened from the page's what's-next strip too. */
  dialog?: null | 'make' | 'redo';
  onDialog?: (dialog: null | 'make' | 'redo') => void;
}) {
  const router = useRouter();
  const ordered = useMemo(() => [...stages].sort((a, b) => (a.sequence || 0) - (b.sequence || 0)), [stages]);
  const [stageId, setStageId] = useState<string | null>(null);
  const stage = ordered.find(s => s.id === stageId) || ordered[0] || null;
  const [showAll, setShowAll] = useState(false);
  const [ownDialog, setOwnDialog] = useState<null | 'make' | 'redo'>(null);
  const dialog = dialogProp !== undefined ? dialogProp : ownDialog;
  const setDialog = onDialog ?? setOwnDialog;
  const [busy, setBusy] = useState(false);

  const active = entrants.filter(e => e.status !== 'withdrawn');
  const withdrawnIds = new Set(entrants.filter(e => e.status === 'withdrawn').map(e => e.id));
  const stageGames = games.filter(g => (stage ? g.stageId === stage.id : !g.stageId));
  // A fixture that belongs to no stage still belongs to this division (`PEOPLE-3`).
  const loose = ordered.length <= 1 ? games.filter(g => !g.stageId) : [];
  const shown = [...stageGames, ...loose];
  const played = games.filter(isPlayedFixture).length;
  const byHand = format?.format === 'Festival';
  const isFirstStage = stage?.id === ordered[0]?.id;
  const stageStarted = stageGames.some(isPlayedFixture);
  const addFixture = () => router.push(`/admin/${orgId}/events/${eventId}/games/new`);

  const generate = async (mode: 'create' | 'regenerate') => {
    if (!stage) return;
    setBusy(true);
    const result = await sendAction(SocketAction.GENERATE_STAGE_FIXTURES, { stageId: stage.id, orgId, mode }, { timeoutMs: 15000 });
    setBusy(false);
    if (result.ok) setDialog(null);
  };

  /* -- one fixture ------------------------------------------------------------------------- */
  const fixtureRow = (g: GameSummary, i: number) => {
    const [home, away] = g.participants || [];
    const homeNames = fixtureSideNames(home, ownOrgId);
    const awayNames = fixtureSideNames(away, ownOrgId);
    // On a wide screen the names start from the full ones; a phone starts at the short codes.
    const wide = (n: typeof homeNames) => (isWide ? { ...n, shortSteps: n.steps } : n);
    const scores = sideScores(g);
    const live = g.status === 'Live';
    const court = facilities.find(f => f.id === g.facilityId)?.name;
    return (
      <TouchableOpacity
        key={g.id}
        onPress={() => router.push(`/admin/${orgId}/events/${eventId}/games/${g.id}/view`)}
        accessibilityRole="link"
        className={`py-2 ${i ? 'border-t border-line-soft' : ''} ${live ? 'bg-danger-soft rounded-lg px-2 -mx-2' : ''}`}
      >
        <View className="flex-row items-center gap-2">
          <FixtureSideFitted names={wide(homeNames)} participant={home} align="left" struck={!!home?.entrantId && withdrawnIds.has(home.entrantId)} />
          <View className="items-center" style={{ minWidth: 52 }}>
            {scores ? (
              <Text className={`font-orbitron-bold text-[15px] ${live ? 'text-danger-ink' : 'text-ink'}`}>{scores[0]} – {scores[1]}</Text>
            ) : (
              <Text className="font-inter text-[13px] text-ink-muted">vs</Text>
            )}
          </View>
          <FixtureSideFitted names={wide(awayNames)} participant={away} align="right" struck={!!away?.entrantId && withdrawnIds.has(away.entrantId)} />
        </View>
        {live || court || g.periodLabel ? (
          <View className="flex-row items-center gap-2 mt-1">
            {live ? <RowTag tone="live" label="Live" /> : null}
            <Text className="font-inter text-xs text-ink-muted flex-1" numberOfLines={1}>
              {[g.periodLabel, court].filter(Boolean).join(' · ')}
            </Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  /* -- the list, by kick-off once there are times ------------------------------------------- */
  const list = () => {
    const visible = showAll ? shown : shown.slice(0, SHOWN);
    const timed = visible.some(g => !g.timeTbd && (g.scheduledStartTime || g.startTime));
    if (!timed) return <View>{visible.map(fixtureRow)}</View>;
    const groups = new Map<string, GameSummary[]>();
    for (const g of visible) {
      const key = g.timeTbd || !(g.scheduledStartTime || g.startTime) ? 'Time to be set' : formatFixtureWhen(g.scheduledStartTime || g.startTime);
      groups.set(key, [...(groups.get(key) || []), g]);
    }
    return (
      <View className="gap-2">
        {[...groups.entries()].map(([when, items]) => (
          <View key={when}>
            <Text className="font-inter-bold text-xs text-ink-muted pb-1">{when}</Text>
            {items.map(fixtureRow)}
          </View>
        ))}
      </View>
    );
  };

  /* -- before the draw -------------------------------------------------------------------- */
  const beforeDraw = () => {
    if (byHand) {
      return (
        <View className="gap-2">
          <Text className="font-inter text-sm text-ink-muted">Fixtures are added by hand — there is no draw.</Text>
          {canEdit ? <LinkButton label="＋ Add a fixture" onPress={addFixture} /> : null}
        </View>
      );
    }
    if (!isFirstStage) {
      return (
        <View className="gap-2">
          <Text className="font-inter text-sm text-ink-muted">{stage?.name} is drawn once the stage before it has been played.</Text>
          {canEdit ? <PrimaryButton label={stage ? `Make the ${stage.name.toLowerCase()} draw` : 'Make the draw'} onPress={() => setDialog('make')} /> : null}
        </View>
      );
    }
    if (active.length < 2) {
      return <Text className="font-inter text-sm text-ink-muted">The draw is made once there are at least two teams.</Text>;
    }
    return (
      <View className="gap-2">
        <Text className="font-inter text-sm text-ink-muted">
          The draw makes {drawSummary(format, active.length)} from the {active.length} teams in. You can move, add and delete fixtures afterwards.
        </Text>
        {canEdit ? <PrimaryButton label="Make the draw" onPress={() => setDialog('make')} /> : null}
      </View>
    );
  };

  const drawn = stageGames.length > 0;
  const title = games.length ? 'Fixtures' : 'The draw';
  const count = games.length ? (played ? `${played} of ${games.length} played` : games.length) : undefined;

  return (
    <TournamentCard
      title={title}
      count={count}
      right={canEdit && games.length ? <LinkButton label="＋ Add a fixture" onPress={addFixture} /> : undefined}
    >
      {ordered.length > 1 ? (
        <SegmentedControl
          fit
          isCompact
          value={stage?.id || ''}
          onChange={id => { setStageId(id); setShowAll(false); }}
          options={ordered.map(s => ({ key: s.id, label: s.name }))}
        />
      ) : null}

      {drawn || loose.length ? list() : beforeDraw()}

      {shown.length > SHOWN ? (
        <LinkButton label={showAll ? 'Show fewer' : `All ${plural(shown.length, 'fixture')} ›`} onPress={() => setShowAll(v => !v)} />
      ) : null}

      {canEdit && drawn && !byHand ? (
        started || stageStarted ? (
          <Text className="font-inter text-xs text-ink-muted">Games have started — fixtures are changed by hand from here.</Text>
        ) : (
          <LinkButton label="Redo the draw" quiet onPress={() => setDialog('redo')} />
        )
      ) : null}

      <EditDialog
        visible={dialog === 'make'}
        title="Make the draw?"
        onClose={() => setDialog(null)}
        onSave={() => generate('create')}
        saveLabel="Make the draw"
        isSaving={busy}
      >
        <Text className="font-inter text-sm text-ink-soft">
          {isFirstStage ? `${formatDetail(format, active.length)}, from ${plural(active.length, 'team')}.` : `${stage?.name}, from the teams that went through.`} You can move, add and delete fixtures afterwards.
        </Text>
        {isFirstStage && pendingTeams.length ? (
          <Warning>
            {plural(pendingTeams.length, 'team')} {pendingTeams.length === 1 ? 'is' : 'are'} from an organisation that has not accepted yet: {pendingTeams.map(e => e.name || e.label).join(', ')}. If {pendingTeams.length === 1 ? 'it drops' : 'they drop'} out after the draw, it shows as a change since the draw.
          </Warning>
        ) : null}
      </EditDialog>

      <EditDialog
        visible={dialog === 'redo'}
        title="Redo the draw?"
        onClose={() => setDialog(null)}
        onSave={() => generate('regenerate')}
        saveLabel="Redo the draw"
        isSaving={busy}
      >
        <Text className="font-inter text-sm text-ink-soft">
          The {plural(stageGames.length, 'fixture')} are replaced by a new draw of the {plural(active.length, 'team')} now in. No game has started.
        </Text>
        <Warning>Times and courts set by hand are lost with them. Once a game has started, the draw can no longer be redone.</Warning>
      </EditDialog>
    </TournamentCard>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <View className="rounded-xl bg-warning-soft border border-warning-line px-3 py-2">
      <Text className="font-inter text-[13px] text-warning-ink">{children}</Text>
    </View>
  );
}

function LinkButton({ label, onPress, quiet }: { label: string; onPress: () => void; quiet?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" className="self-start py-1">
      <Text className={`font-inter-bold text-[13px] ${quiet ? 'text-ink-muted' : 'text-primary-ink'}`}>{label}</Text>
    </TouchableOpacity>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" className="self-start rounded-xl bg-primary px-4 py-2">
      <Text className="font-inter-bold text-sm text-on-primary">{label}</Text>
    </TouchableOpacity>
  );
}
