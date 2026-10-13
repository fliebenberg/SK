import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Event,
  GameSummary,
  SocketAction,
  TournamentDivision,
  TournamentEntrant,
  dualUnpaired,
  isEntrantEntered,
  isPlayedFixture,
  toEntrantInput,
} from '@sk/shared';
import { OverflowMenu, OverflowMenuItem } from '../OverflowMenu';
import { ConfirmationModal } from '../ConfirmationModal';
import { EditDialog } from '../EditDialog';
import { FixtureCrest, sideScores } from '../events/EventBits';
import { TournamentCard } from './TournamentBits';
import { sendAction } from '../../services/actions';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';

/**
 * A Head to Head division's games (`H2H-1`, option A agreed 2026-10-13 on
 * `mockups/head-to-head.html`): two columns, the host's teams on the left and the other
 * organisation's on the right, each game a row of two pickers.
 *
 * - **Pair automatically** enters both sides' teams of the division's age group and pairs them in
 *   name order, A v A, B v B (`PAIR_DUAL_DIVISIONS`). *Pair again* redoes it, until a game starts.
 * - **Changing a picker swaps the teams around**: choosing a team that already plays puts the team
 *   it replaces into that team's game, so every team keeps one game.
 * - **A team with no game** has its own row with *Choose opponent*, where it can play a team that
 *   already has a game, or be left out — taken out of the division.
 * - A game that has started is fixed: its row shows the score and cannot change.
 *
 * Every change is saved at once as the division's whole set of games (`SET_DUAL_PAIRING`); the
 * server keeps a game whose two sides did not change, with its time and court. A refusal is already
 * said by `sendAction`, and the rows stay as the server has them.
 */
export function DualPairingCard({ event, division, orgId, entrants, games, canEdit, footer }: {
  event: Event;
  division: TournamentDivision;
  orgId: string;
  entrants: TournamentEntrant[];
  games: GameSummary[];
  canEdit: boolean;
  /** Scheduling, under the games, as on a tournament division. */
  footer?: React.ReactNode;
}) {
  const isDark = useActiveTheme() === 'dark';
  const hostId = event.orgId;
  const guestBadge = (event.participatingOrgs || []).find(o => o.id !== hostId && o.invitation !== 'declined' && o.invitation !== 'withdrawn');
  const hostBadge = (event.participatingOrgs || []).find(o => o.id === hostId);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | 'again' | { leaveOut: TournamentEntrant }>(null);
  const [adding, setAdding] = useState(false);

  const entered = entrants.filter(e => isEntrantEntered(e.status));
  const hostTeams = entered.filter(e => e.orgId === hostId);
  const guestTeams = entered.filter(e => !!guestBadge && e.orgId === guestBadge.id);
  const live = games.filter(g => g.status !== 'Cancelled');
  const started = live.some(isPlayedFixture);
  const unpaired = dualUnpaired(entered, live);
  const nameOf = (id?: string) => entrants.find(e => e.id === id)?.name || entrants.find(e => e.id === id)?.label || 'Team';

  /** Each game as [host entrant, guest entrant], in the order shown. */
  const pairOf = (g: GameSummary): [string, string] => {
    const ids = (g.participants || []).map(p => p.entrantId || '');
    const h = ids.find(id => hostTeams.some(e => e.id === id)) || ids[0];
    const a = ids.find(id => id !== h) || '';
    return [h, a];
  };
  const pairs = live.map(pairOf);

  const save = async (next: Array<[string, string]>) => {
    setBusy(true);
    const result = await sendAction(SocketAction.SET_DUAL_PAIRING, { divisionId: division.id, orgId, pairs: next.map(entrantIds => ({ entrantIds })) });
    setBusy(false);
    return result.ok;
  };
  const pairAutomatically = async (replace: boolean) => {
    setBusy(true);
    const result = await sendAction(SocketAction.PAIR_DUAL_DIVISIONS, { eventId: event.id, orgId, divisionIds: [division.id], replace });
    setBusy(false);
    if (result.ok) setConfirm(null);
  };
  /** Put `entrantId` on `side` of game `i`; where it already played, the team it replaces goes there. */
  const change = (i: number, side: 0 | 1, entrantId: string) => {
    const next = pairs.map(p => [...p] as [string, string]);
    const previous = next[i][side];
    if (previous === entrantId) return;
    const j = next.findIndex((p, k) => k !== i && p[side] === entrantId);
    next[i][side] = entrantId;
    if (j >= 0) next[j][side] = previous;
    save(next);
  };
  const leaveOut = async (entrant: TournamentEntrant) => {
    setBusy(true);
    const result = await sendAction(SocketAction.SET_DIVISION_ENTRANTS, {
      divisionId: division.id,
      orgId,
      entrants: entrants.filter(e => e.id !== entrant.id).map(toEntrantInput),
    });
    setBusy(false);
    if (result.ok) setConfirm(null);
  };

  const crest = (org?: { id: string; logo?: string; logoConfig?: any; primaryColor?: string }, size = 20) =>
    org ? <FixtureCrest participant={{ id: org.id, orgId: org.id, orgLogo: org.logo, orgLogoConfig: org.logoConfig, orgPrimaryColor: org.primaryColor }} size={size} /> : null;

  /** Who else a team could play: the side's teams, each saying whom it already plays. */
  const choices = (side: 0 | 1, current: string | null, onChoose: (id: string) => void): OverflowMenuItem[] =>
    (side === 0 ? hostTeams : guestTeams)
      .filter(e => e.id !== current)
      .map(e => {
        const plays = pairs.filter(p => p[side] === e.id).map(p => nameOf(p[side === 0 ? 1 : 0]));
        return {
          label: e.name || e.label || 'Team',
          description: plays.length ? `Already plays ${plays.join(' and ')}` : 'No game yet',
          icon: 'people-outline' as const,
          onPress: () => onChoose(e.id),
        };
      });

  const slot = (label: string, opts: { items?: OverflowMenuItem[]; empty?: boolean; tag?: string; a11y: string }) => {
    const box = (open?: () => void) => (
      <TouchableOpacity
        onPress={open}
        disabled={!open || busy}
        accessibilityRole="button"
        accessibilityLabel={opts.a11y}
        className={`flex-1 min-w-0 flex-row items-center gap-1.5 rounded-xl border px-2.5 py-2 bg-card ${opts.empty ? 'border-dashed border-line-strong' : 'border-line'}`}
      >
        <Text className={`flex-1 text-sm ${opts.empty ? 'font-inter-semibold text-primary-ink' : 'font-inter-semibold text-ink'}`} numberOfLines={1}>{label}</Text>
        {opts.tag ? (
          <View className="rounded-full bg-info-soft px-1.5 py-0.5"><Text className="font-inter-semibold text-[10px] text-info-ink">{opts.tag}</Text></View>
        ) : null}
        {open ? <Ionicons name="chevron-down" size={13} color={themeColor(isDark, 'ink-muted')} /> : null}
      </TouchableOpacity>
    );
    return canEdit && opts.items?.length
      ? <View className="flex-1 min-w-0"><OverflowMenu items={opts.items} title={opts.a11y} renderTrigger={open => box(open)} /></View>
      : box();
  };
  const invitedTag = (id: string) => (entrants.find(e => e.id === id)?.status === 'invited' ? 'Invited' : undefined);

  const header = (
    <View className="flex-row items-center gap-2 pb-1">
      <View className="flex-1 flex-row items-center gap-1.5 min-w-0">
        {crest(hostBadge)}
        <Text className="font-inter-bold text-[13px] text-ink-soft" numberOfLines={1}>{hostBadge?.name || 'You'}</Text>
      </View>
      <View style={{ width: 28 }} />
      <View className="flex-1 flex-row items-center justify-end gap-1.5 min-w-0">
        <Text className="font-inter-bold text-[13px] text-ink-soft" numberOfLines={1}>{guestBadge?.name || 'To be chosen'}</Text>
        {crest(guestBadge)}
      </View>
      {canEdit ? <View style={{ width: 24 }} /> : null}
    </View>
  );

  const gameRow = (g: GameSummary, i: number) => {
    const [h, a] = pairs[i];
    const fixed = isPlayedFixture(g);
    const scores = fixed ? sideScores(g) : null;
    const hostFirst = (g.participants || [])[0]?.entrantId === h;
    const mid = scores ? (hostFirst ? `${scores[0]}–${scores[1]}` : `${scores[1]}–${scores[0]}`) : g.status === 'Live' ? 'Live' : 'v';
    const rowMenu: OverflowMenuItem[] = [
      fixed
        ? { label: 'Remove game', description: 'It has started, so it can no longer be removed', icon: 'trash-outline', onPress: () => {}, disabled: true, destructive: true }
        : { label: 'Remove game', description: 'Both teams stay in the division', icon: 'trash-outline', onPress: () => save(pairs.filter((_, k) => k !== i)), destructive: true },
    ];
    return (
      <View key={g.id} className="flex-row items-center gap-2 py-1.5 border-t border-line-soft">
        {slot(nameOf(h), { items: fixed ? undefined : choices(0, h, id => change(i, 0, id)), a11y: `${nameOf(h)}, ${hostBadge?.name || 'your'} side of game ${i + 1}` })}
        <Text className={`font-orbitron-bold text-[11px] text-center ${g.status === 'Live' ? 'text-danger-ink' : 'text-ink-muted'}`} style={{ width: 28 }}>{mid}</Text>
        {slot(nameOf(a), { items: fixed ? undefined : choices(1, a, id => change(i, 1, id)), tag: invitedTag(a), a11y: `${nameOf(a)}, ${guestBadge?.name || 'their'} side of game ${i + 1}` })}
        {canEdit ? <View style={{ width: 24 }}><OverflowMenu items={rowMenu} title={`${nameOf(h)} v ${nameOf(a)}`} accessibilityLabel={`Game ${i + 1} actions`} /></View> : null}
      </View>
    );
  };

  const aloneRow = (e: TournamentEntrant) => {
    const isHost = e.orgId === hostId;
    const side: 0 | 1 = isHost ? 1 : 0;
    const items: OverflowMenuItem[] = [
      ...choices(side, null, id => save([...pairs, isHost ? [e.id, id] : [id, e.id]])),
      { label: 'Leave out of the day', description: 'Takes the team out of this division', icon: 'remove-circle-outline', onPress: () => setConfirm({ leaveOut: e }) },
    ];
    const team = slot(e.name || e.label || 'Team', { tag: invitedTag(e.id), a11y: `${e.name || 'Team'}, no game yet` });
    const opponent = slot('Choose opponent', { items, empty: true, a11y: `Choose an opponent for ${e.name || 'the team'}` });
    return (
      <View key={e.id} className="flex-row items-center gap-2 py-1.5 border-t border-line-soft">
        {isHost ? team : opponent}
        <Text className="font-orbitron-bold text-[11px] text-ink-muted text-center" style={{ width: 28 }}>v</Text>
        {isHost ? opponent : team}
        {canEdit ? <View style={{ width: 24 }} /> : null}
      </View>
    );
  };

  const empty = !live.length;
  return (
    <TournamentCard
      title="Games"
      count={live.length || undefined}
      right={canEdit && !empty && !started ? (
        <TouchableOpacity onPress={() => setConfirm('again')} accessibilityRole="button" hitSlop={8}>
          <Text className="font-inter-bold text-[13px] text-primary-ink">Pair again automatically</Text>
        </TouchableOpacity>
      ) : undefined}
    >
      {empty ? (
        <View className="gap-2.5">
          <Text className="font-inter text-[13px] text-ink-muted leading-relaxed">
            {guestBadge
              ? `No games yet. Pairing automatically enters both sides' ${division.ageGroup || ''} teams and puts each against the other side's team in the same place: A v A, B v B. You can change any game afterwards.`.replace('  ', ' ')
              : 'Choose the organisation you are playing first, under Playing against on the Overview.'}
          </Text>
          {canEdit && guestBadge ? (
            <View className="flex-row flex-wrap items-center gap-3">
              <TouchableOpacity onPress={() => pairAutomatically(false)} disabled={busy} accessibilityRole="button" className="rounded-xl bg-primary px-4 py-2">
                <Text className="font-inter-bold text-sm text-on-primary">{busy ? 'Pairing…' : 'Pair automatically'}</Text>
              </TouchableOpacity>
              {hostTeams.length && guestTeams.length ? (
                <TouchableOpacity onPress={() => setAdding(true)} accessibilityRole="button">
                  <Text className="font-inter-bold text-[13px] text-primary-ink">＋ Add a game</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
          {unpaired.length ? <View>{header}{unpaired.map(aloneRow)}</View> : null}
        </View>
      ) : (
        <View>
          {header}
          {live.map(gameRow)}
          {unpaired.map(aloneRow)}
          {canEdit ? (
            <TouchableOpacity onPress={() => setAdding(true)} accessibilityRole="button" className="self-start pt-2.5">
              <Text className="font-inter-bold text-[13px] text-primary-ink">＋ Add a game</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
      {footer}

      <ConfirmationModal
        isOpen={confirm === 'again'}
        title="Pair again automatically?"
        description={`The ${live.length === 1 ? 'game is' : `${live.length} games are`} replaced by pairing the teams in name order, A v A, B v B. Any times and courts already given are lost.`}
        confirmText="Pair again"
        cancelText="Keep these"
        isProcessing={busy}
        onConfirm={() => pairAutomatically(true)}
        onClose={() => setConfirm(null)}
      />
      <ConfirmationModal
        isOpen={!!confirm && typeof confirm === 'object'}
        title={`Leave ${confirm && typeof confirm === 'object' ? confirm.leaveOut.name || 'the team' : 'the team'} out?`}
        description="It is taken out of this division, and plays no game in it. It can be added again from Teams."
        confirmText="Leave out"
        cancelText="Keep it"
        isProcessing={busy}
        onConfirm={() => confirm && typeof confirm === 'object' && leaveOut(confirm.leaveOut)}
        onClose={() => setConfirm(null)}
      />
      <AddGameDialog
        visible={adding}
        hostName={hostBadge?.name || 'You'}
        guestName={guestBadge?.name || 'They'}
        hostTeams={hostTeams}
        guestTeams={guestTeams}
        pairs={pairs}
        onClose={() => setAdding(false)}
        onAdd={async pair => { if (await save([...pairs, pair])) setAdding(false); }}
        saving={busy}
      />
    </TournamentCard>
  );
}

/** *Add a game*: one team from each side. A team may play twice; each says whom it already plays. */
function AddGameDialog({ visible, hostName, guestName, hostTeams, guestTeams, pairs, onClose, onAdd, saving }: {
  visible: boolean;
  hostName: string;
  guestName: string;
  hostTeams: TournamentEntrant[];
  guestTeams: TournamentEntrant[];
  pairs: Array<[string, string]>;
  onClose: () => void;
  onAdd: (pair: [string, string]) => void;
  saving: boolean;
}) {
  const [host, setHost] = useState<string | null>(null);
  const [guest, setGuest] = useState<string | null>(null);
  React.useEffect(() => { if (visible) { setHost(null); setGuest(null); } }, [visible]);
  const all = [...hostTeams, ...guestTeams];
  const name = (id: string) => all.find(e => e.id === id)?.name || 'Team';
  const column = (title: string, teams: TournamentEntrant[], side: 0 | 1, chosen: string | null, choose: (id: string) => void) => (
    <View className="flex-1 gap-1 min-w-0">
      <Text className="font-inter-bold text-[13px] text-ink-soft" numberOfLines={1}>{title}</Text>
      {teams.map(e => {
        const plays = pairs.filter(p => p[side] === e.id).map(p => name(p[side === 0 ? 1 : 0]));
        const on = chosen === e.id;
        return (
          <TouchableOpacity
            key={e.id}
            onPress={() => choose(e.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            className={`rounded-xl border px-2.5 py-2 ${on ? 'border-primary bg-primary-soft' : 'border-line'}`}
          >
            <Text className="font-inter-semibold text-sm text-ink" numberOfLines={1}>{e.name || e.label}</Text>
            <Text className="font-inter text-[11px] text-ink-muted" numberOfLines={1}>{plays.length ? `Plays ${plays.join(', ')}` : 'No game yet'}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
  return (
    <EditDialog
      visible={visible}
      title="Add a game"
      onClose={onClose}
      onSave={() => host && guest && onAdd([host, guest])}
      saveLabel="Add game"
      saveDisabled={!host || !guest}
      isSaving={saving}
      isDirty={!!host || !!guest}
    >
      <View className="flex-row gap-3">
        {column(hostName, hostTeams, 0, host, setHost)}
        {column(guestName, guestTeams, 1, guest, setGuest)}
      </View>
    </EditDialog>
  );
}
