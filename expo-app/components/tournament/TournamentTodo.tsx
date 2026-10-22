import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Event, GameSummary, SocketAction, Sport, Team, TournamentDivision, TournamentEntrant, divisionFullName, entrantTakesAPlace, hasLeft, isEntrantInPlay } from '@sk/shared';
import { ConfirmationModal } from '../ConfirmationModal';
import { EditDialog } from '../EditDialog';
import { TEXT_INPUT } from '../formStyles';
import { EntrantBadge } from './DivisionEntries';
import { sendAction } from '../../services/actions';
import { useAuthStore } from '../../store/authStore';
import { useOrgTeams } from '../../hooks/useOrgTeams';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';
import { wsService } from '../../services/websocket';
import { useWsStore } from '../../store/wsStore';
import { formatInstantDate, formatKickoffTime } from '../../utils/dates';

/**
 * **To do** — what a taking-part organisation still owes a tournament (`FIX-24`, agreed 2026-10-18 on
 * `mockups/tournament-participant.html`; docs/events.md §7). It grows out of the *Your teams are
 * invited* card, in the same place under the banner, and lists what the viewer answers for: a
 * coach's own teams, every team of an organisation they admin — whatever the view switch shows.
 *
 * Each task is the viewer's own or a coach's. **An admin's own** are what only an admin can do, then
 * team tasks for a team with no coach; the rest are its coaches'. The Overview's card holds only the
 * viewer's own, at most five, and says how many more there are; *See all* opens the tournament's
 * To do page, which holds everything. Its tasks: a team to answer, a place kept for the
 * organisation to name (`FIX-32`, an admin's only), a team to pick for its first game, and games
 * whose team is only proposed — taken from the team's previous game — to confirm (`FIX-32`).
 * A team task is its coach's when it has one, and the admin's own when it has none.
 */

export type TodoKind = 'answer' | 'name' | 'pick' | 'confirm';

export interface TodoTask {
  key: string;
  kind: TodoKind;
  entrant: TournamentEntrant;
  sportId?: string;
  sportName: string;
  /** The team, as the organisation knows it. */
  teamName: string;
  divisionName: string;
  division: TournamentDivision;
  /** The viewer's own to do, rather than one of the organisation's coaches'. */
  mine: boolean;
  /** For a place to name: the teams already in the tournament, which cannot take it. */
  takenTeamIds?: string[];
  /** A team task's line under the name: the game it waits on, or how many games are proposed. */
  detail?: string;
  /** When it is needed by — the first game it holds up, an instant — for the order. */
  due?: string | null;
  /** The game to open: the first to pick, or the first proposed. */
  gameId?: string;
  teamId?: string;
  /** The team's head coach, whose task it is when the viewer is not them. */
  coachName?: string | null;
  /** The proposed games to confirm, each by its side. */
  proposed?: Array<{ gameId: string; participantId: string }>;
}

/** One of the viewer's teams in one game still to play (`get_data` `event_lineups`). */
interface EventLineup {
  gameId: string;
  participantId: string;
  teamId: string;
  startTime: string | null;
  picked: boolean;
  proposedFromGameId: string | null;
  asCoach: boolean;
}

/** The viewer's teams' games still to play in a tournament, read again when the page comes back. */
function useEventLineups(eventId: string | null, userId?: string) {
  const isConnected = useWsStore((state: any) => state.isConnected);
  const [lineups, setLineups] = useState<EventLineup[]>([]);
  const load = useCallback(() => {
    if (!isConnected || !eventId || !userId) return;
    wsService.emit('get_data', { type: 'event_lineups', eventId, userId }, (data: any) => setLineups(Array.isArray(data) ? data : []));
  }, [isConnected, eventId, userId]);
  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return { lineups, reload: load };
}

/** A line of the list: one task, or more than three teams to answer as one. */
export interface TodoRow {
  key: string;
  tasks: TodoTask[];
  mine: boolean;
}

/** On the Overview's card, at most this many of the viewer's own. */
export const TODO_CARD_LIMIT = 5;
/** More teams than this to answer, for one organisation, are one line (*Accept all*). */
const ANSWERS_ONE_LINE = 3;

const KIND_ORDER: Record<TodoKind, number> = { answer: 0, name: 1, pick: 2, confirm: 3 };
const ACTIVE = (m: any) => !m.endDate || new Date(m.endDate) > new Date();

/** Everything the viewer may still need to do in this tournament, in order. */
export function useTournamentTodo({ event, divisions, entrants, canEdit, sports, games = [], orgId }: {
  event: Event;
  divisions: TournamentDivision[];
  entrants: TournamentEntrant[];
  /** An organiser: their work is the tournament's own, not this list. */
  canEdit: boolean;
  sports: Sport[];
  /** The tournament's fixtures, to say whom a team's game is against. */
  games?: GameSummary[];
  /** The acting workspace, whose teams' coaches the team tasks name. */
  orgId?: string;
}): { tasks: TodoTask[]; rows: TodoRow[]; reload: () => void } {
  const orgMemberships = useAuthStore((state: any) => state.orgMemberships) || [];
  const teamMemberships = useAuthStore((state: any) => state.teamMemberships) || [];
  const userId = useAuthStore((state: any) => state.user?.id) as string | undefined;
  const { lineups, reload } = useEventLineups(canEdit ? null : event.id, userId);
  const { teams } = useOrgTeams(canEdit ? null : orgId);
  const listed = useMemo(() => {
    if (canEdit) return { tasks: [], rows: [] };
    const adminsOrg = (id?: string) => !!id && orgMemberships.some((m: any) => m.orgId === id && m.roleId === 'role-org-admin' && ACTIVE(m));
    const coachTeamIds = new Set<string>(teamMemberships
      .filter((m: any) => (m.roleId === 'role-coach' || m.roleId === 'role-assistant-coach') && ACTIVE(m))
      .map((m: any) => m.teamId));
    const invitationOf = (id?: string) => event.participatingOrgs?.find(o => o.id === id)?.invitation;
    const divisionOf = (id: string) => divisions.find(d => d.id === id);
    const sportName = (id?: string | null) => sports.find(s => s.id === id)?.name || '';
    const sportOrder = (id?: string) => { const i = (event.sportIds || []).indexOf(id || ''); return i < 0 ? 99 : i; };

    const tasks: TodoTask[] = [];
    const takenTeamIds = entrants.filter(e => !!e.teamId && entrantTakesAPlace(e.status)).map(e => e.teamId!);
    for (const e of entrants) {
      const division = divisionOf(e.divisionId);
      // A place kept for the organisation, its team still to name (`FIX-32`): its admins name it.
      if (division && !e.teamId && !e.orgProfileId && e.orgId && e.status === 'accepted' && adminsOrg(e.orgId)
          && !hasLeft(invitationOf(e.orgId) || 'accepted')) {
        tasks.push({
          key: `name:${e.id}`, kind: 'name', entrant: e, division,
          sportId: division.sportId || undefined, sportName: sportName(division.sportId),
          teamName: e.label || 'A team to be named', divisionName: divisionFullName(division.name, sportName(division.sportId)),
          mine: true, takenTeamIds,
        });
        continue;
      }
      // A team to answer: invited, its division still open, its organisation still in it, and the
      // viewer its coach or an admin of its organisation (`FIX-31`). Only an admin's to do, or the coach's.
      if (e.status !== 'invited' || !division || division.entriesLockedAt || hasLeft(invitationOf(e.orgId) || 'accepted')) continue;
      const asAdmin = adminsOrg(e.orgId);
      if (!asAdmin && !(e.teamId && coachTeamIds.has(e.teamId))) continue;
      tasks.push({
        key: `answer:${e.id}`, kind: 'answer', entrant: e, division,
        sportId: division.sportId || undefined, sportName: sportName(division.sportId),
        teamName: e.name || 'Your team', divisionName: divisionFullName(division.name, sportName(division.sportId)),
        mine: true,
      });
    }

    /*
     * A team per game (`FIX-32`): for each of the viewer's teams, its first game with no team and
     * nothing to take one from — *Pick team* — and the games whose team is only proposed — *Confirm*.
     * The coach's when the team has one; the admin's own when it has none.
     */
    const when = (at: string | null) => (at ? `${formatInstantDate(at)} ${formatKickoffTime(at)}` : 'time to come');
    const against = (gameId: string, teamId: string) => {
      const other = games.find(g => g.id === gameId)?.participants?.find(p => p.teamId !== teamId);
      return other ? ` v ${[other.orgShortName, other.name].filter(Boolean).join(' ')}` : '';
    };
    const byTeam = new Map<string, EventLineup[]>();
    for (const l of lineups) byTeam.set(l.teamId, [...(byTeam.get(l.teamId) || []), l]);
    for (const [teamId, list] of byTeam) {
      const e = entrants.find(x => x.teamId === teamId && isEntrantInPlay(x.status));
      const division = e ? divisionOf(e.divisionId) : undefined;
      if (!e || !division) continue;
      const coachName = (teams as Team[]).find(t => t.id === teamId)?.coachName || null;
      const mine = list.some(l => l.asCoach) || !coachName;
      const base = {
        entrant: e, division, teamId, coachName, mine,
        sportId: division.sportId || undefined, sportName: sportName(division.sportId),
        teamName: e.name || 'Your team', divisionName: divisionFullName(division.name, sportName(division.sportId)),
      };
      const first = list.find(l => !l.picked && !l.proposedFromGameId);
      if (first) {
        tasks.push({ ...base, key: `pick:${teamId}`, kind: 'pick', gameId: first.gameId, due: first.startTime,
          detail: `no team picked · ${when(first.startTime)}${against(first.gameId, teamId)}` });
      }
      const proposed = list.filter(l => !l.picked && !!l.proposedFromGameId);
      if (proposed.length) {
        tasks.push({ ...base, key: `confirm:${teamId}`, kind: 'confirm', gameId: proposed[0].gameId, due: proposed[0].startTime,
          proposed: proposed.map(l => ({ gameId: l.gameId, participantId: l.participantId })),
          detail: `${proposed.length} ${proposed.length === 1 ? 'game' : 'games'} with a proposed team, not confirmed` });
      }
    }

    tasks.sort((a, b) => (Number(b.mine) - Number(a.mine)) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
      || (a.due || '~').localeCompare(b.due || '~')
      || sportOrder(a.sportId) - sportOrder(b.sportId) || a.divisionName.localeCompare(b.divisionName) || a.teamName.localeCompare(b.teamName));

    // Many teams to answer for one organisation are one line, in the place of its first.
    const answersByOrg = new Map<string, TodoTask[]>();
    for (const t of tasks) if (t.kind === 'answer') answersByOrg.set(t.entrant.orgId || '', [...(answersByOrg.get(t.entrant.orgId || '') || []), t]);
    const rows: TodoRow[] = [];
    const grouped = new Set<string>();
    for (const t of tasks) {
      const sameOrg = t.kind === 'answer' ? answersByOrg.get(t.entrant.orgId || '') || [] : [];
      if (sameOrg.length > ANSWERS_ONE_LINE) {
        if (grouped.has(t.entrant.orgId || '')) continue;
        grouped.add(t.entrant.orgId || '');
        rows.push({ key: `answers:${t.entrant.orgId}`, tasks: sameOrg, mine: sameOrg.every(x => x.mine) });
      } else {
        rows.push({ key: t.key, tasks: [t], mine: t.mine });
      }
    }
    return { tasks, rows };
  }, [canEdit, entrants, divisions, event, orgMemberships, teamMemberships, sports, lineups, teams, games]);
  return { ...listed, reload };
}

/** A `get_data` read as a promise. */
const read = (request: any) => new Promise<any>(resolve => wsService.emit('get_data', request, resolve));

/**
 * Confirming a team's proposed games (`FIX-32`): each saves its proposal as the game's own team,
 * through `sendAction`, stopping at the first that fails.
 */
async function confirmProposals(list: Array<{ gameId: string; participantId: string }>): Promise<void> {
  for (const side of list) {
    const proposal = await read({ type: 'game_roster_proposal', id: side.participantId });
    if (!proposal?.items?.length) continue;
    const items = proposal.items.map((r: any) => ({ orgProfileId: r.orgProfileId, position: r.position || undefined, jerseyNumber: r.jerseyNumber || undefined, isReserve: !!r.isReserve }));
    const result = await sendAction(SocketAction.SAVE_GAME_ROSTER, { gameId: side.gameId, participantId: side.participantId, items });
    if (!result.ok) return;
  }
}

/**
 * Answering for teams: one at a time, or all of a line at once — each through `sendAction`, stopping
 * at the first that fails, so nothing reads as answered that was not.
 */
function useAnswers(orgId: string) {
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState<TournamentEntrant | null>(null);
  const answer = async (list: TournamentEntrant[], value: 'accepted' | 'declined') => {
    setBusy(true);
    for (const e of list) {
      const result = await sendAction(SocketAction.SET_ENTRANT_ANSWER, { divisionId: e.divisionId, entrantId: e.id, orgId, answer: value });
      if (!result.ok) { setBusy(false); return; }
    }
    setBusy(false);
    setDeclining(null);
  };
  return { busy, declining, setDeclining, answer };
}

function Button({ label, onPress, disabled, primary }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className={primary ? 'rounded-xl bg-primary px-3 py-1.5' : 'rounded-xl border border-line-strong bg-card px-3 py-1.5'}
    >
      <Text className={`font-inter-bold text-[13px] ${primary ? 'text-on-primary' : 'text-ink'}`}>{label}</Text>
    </TouchableOpacity>
  );
}

/** The rows themselves — the card's and the page's — with their buttons and the decline confirmation. */
export function TodoRows({ rows, orgId, eventName, orgName, onAnswerEach, onOpenGame, onChanged, showWhose = false }: {
  rows: TodoRow[];
  /** The acting workspace. */
  orgId: string;
  eventName: string;
  orgName: (orgId?: string) => string;
  /** *Answer each ›* on a line of many teams: the organisation's page in the tournament. */
  onAnswerEach: (participantOrgId: string) => void;
  /** A team task's game: its page, or its Pick team screen for the team. */
  onOpenGame: (gameId: string, pickFor?: string) => void;
  /** After *Confirm all*, so the list reads its games again. */
  onChanged?: () => void;
  /** On the page: say whose a task is when it is not the viewer's. */
  showWhose?: boolean;
}) {
  const { busy, declining, setDeclining, answer } = useAnswers(orgId);
  const [confirming, setConfirming] = useState<string | null>(null);
  const confirmAll = async (t: TodoTask) => {
    setConfirming(t.key);
    await confirmProposals(t.proposed || []);
    setConfirming(null);
    onChanged?.();
  };
  const [naming, setNaming] = useState<TodoTask | null>(null);
  return (
    <View>
      {rows.map((row, i) => {
        const first = row.tasks[0];
        const many = row.tasks.length > 1;
        return (
          <View
            key={row.key}
            testID={first.kind === 'name' ? `todo-name-${first.entrant.id}` : first.kind === 'pick' || first.kind === 'confirm' ? `todo-${first.kind}-${first.teamId}` : many ? `todo-answers-${first.entrant.orgId}` : `team-invite-${first.entrant.id}`}
            className={`flex-row flex-wrap items-center gap-x-3 gap-y-2 py-2 ${i ? 'border-t border-line-soft' : ''}`}
          >
            <View className="flex-1" style={{ minWidth: 180 }}>
              <Text className={first.kind === 'name' ? 'font-inter-bold text-sm text-ink-muted italic' : 'font-inter-bold text-sm text-ink'}>
                {many ? `${row.tasks.length} teams to answer` : first.teamName}
              </Text>
              {many ? (
                <Text className="font-inter text-xs text-ink-muted">
                  {row.tasks.map((t, k) => (
                    <Text key={t.key} testID={`team-invite-${t.entrant.id}`}>{k ? ', ' : ''}{t.divisionName} {t.teamName}</Text>
                  ))}
                </Text>
              ) : (
                <Text className="font-inter text-xs text-ink-muted">
                  {first.divisionName}
                  {first.kind === 'name' ? ' · the organisers kept you a place — which team is it?' : ''}
                  {first.detail ? ` · ${first.detail}` : ''}
                  {showWhose && !row.mine ? ` · ${first.coachName ? `${first.coachName}’s` : 'its coach’s'}` : ''}
                  {showWhose && row.mine && (first.kind === 'pick' || first.kind === 'confirm') && !first.coachName ? ' · no coach' : ''}
                </Text>
              )}
            </View>
            {first.kind === 'name' ? (
              <Button primary label="Name the team" onPress={() => setNaming(first)} />
            ) : first.kind === 'pick' ? (
              <Button primary label="Pick team" onPress={() => onOpenGame(first.gameId!, first.teamId)} />
            ) : first.kind === 'confirm' ? (
              <View className="flex-row gap-2">
                <Button label="Review" onPress={() => onOpenGame(first.gameId!)} />
                <Button primary label={confirming === first.key ? 'Confirming…' : 'Confirm all'} disabled={!!confirming} onPress={() => confirmAll(first)} />
              </View>
            ) : many ? (
              <View className="flex-row gap-2">
                <Button primary label="✓ Accept all" disabled={busy} onPress={() => answer(row.tasks.map(t => t.entrant), 'accepted')} />
                <Button label="Answer each ›" onPress={() => onAnswerEach(first.entrant.orgId || '')} />
              </View>
            ) : (
              <>
                <EntrantBadge status={first.entrant.status} />
                <View className="flex-row gap-2">
                  <Button primary label="✓ Accept" disabled={busy} onPress={() => answer([first.entrant], 'accepted')} />
                  <Button label="✕ Decline" disabled={busy} onPress={() => setDeclining(first.entrant)} />
                </View>
              </>
            )}
          </View>
        );
      })}
      <ConfirmationModal
        isOpen={!!declining}
        title={`Decline ${eventName} for ${declining?.name || 'your team'}?`}
        description={`${orgName(declining?.orgId)}'s admins can still change it while entries are open.`}
        confirmText="✕ Decline"
        cancelText="Cancel"
        variant="danger"
        isProcessing={busy}
        onConfirm={() => declining && answer([declining], 'declined')}
        onClose={() => setDeclining(null)}
      />
      <NameTeamDialog task={naming} orgId={orgId} onClose={() => setNaming(null)} />
    </View>
  );
}

/**
 * Naming a place the organisers kept for the organisation (`FIX-32`, agreed 2026-10-18): one of its
 * teams of the division's sport — its age group first — that is not already in the tournament. Its
 * games keep their times and fields. *We can't send a team* is the answers that already exist: a
 * decline while entries are open, a withdrawal for the organisers to confirm once they are locked.
 */
function NameTeamDialog({ task, orgId, onClose }: { task: TodoTask | null; orgId: string; onClose: () => void }) {
  const isDark = useActiveTheme() === 'dark';
  const { teams } = useOrgTeams(task?.entrant.orgId);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [cannot, setCannot] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (task) { setTeamId(null); setCannot(false); setReason(''); } }, [task]);
  const division = task?.division;
  const locked = !!division?.entriesLockedAt;
  const taken = new Set(task?.takenTeamIds || []);
  const ofSport = (teams as Team[]).filter(t => t.sportId === division?.sportId && t.isActive !== false);
  const sameAge = ofSport.filter(t => !division?.ageGroupId || t.ageGroupId === division.ageGroupId);
  const others = ofSport.filter(t => !sameAge.includes(t));

  const save = async () => {
    if (!task) return;
    setBusy(true);
    const e = task.entrant;
    const result = !cannot
      ? await sendAction(SocketAction.NAME_OWN_PLACEHOLDER, { divisionId: e.divisionId, entrantId: e.id, orgId, teamId: teamId! })
      : locked
        ? await sendAction(SocketAction.REQUEST_ENTRANT_WITHDRAWAL, { divisionId: e.divisionId, entrantId: e.id, orgId, reason: reason.trim() })
        : await sendAction(SocketAction.SET_ENTRANT_ANSWER, { divisionId: e.divisionId, entrantId: e.id, orgId, answer: 'declined', ...(reason.trim() ? { reason: reason.trim() } : {}) });
    setBusy(false);
    if (result.ok) onClose();
  };

  const option = (t: Team) => {
    const isTaken = taken.has(t.id);
    const on = teamId === t.id;
    return (
      <TouchableOpacity
        key={t.id}
        onPress={() => setTeamId(t.id)}
        disabled={isTaken}
        accessibilityRole="radio"
        accessibilityState={{ checked: on, disabled: isTaken }}
        className={`flex-row items-center gap-2.5 py-2 border-t border-line-soft ${isTaken ? 'opacity-50' : ''}`}
      >
        <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={19} color={themeColor(isDark, on ? 'ink' : 'ink-faint')} />
        <Text className="flex-1 font-inter-semibold text-sm text-ink">{t.name}</Text>
        <Text className="font-inter text-xs text-ink-muted">{isTaken ? 'Already in this tournament' : t.ageGroup || ''}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <EditDialog
      visible={!!task}
      title={cannot ? "We can't send a team" : 'Name your team'}
      onClose={onClose}
      onSave={save}
      saveLabel={cannot ? (locked ? 'Ask to withdraw' : 'Give up the place') : 'Name the team'}
      saveDisabled={cannot ? locked && !reason.trim() : !teamId}
      isSaving={busy}
      isDirty={!!teamId || !!reason.trim()}
    >
      <Text className="font-inter text-sm text-ink-muted">{task ? `${task.divisionName} · \u201c${task.teamName}\u201d` : ''}</Text>
      {cannot ? (
        <>
          <Text className="font-inter text-sm text-ink leading-relaxed">
            {locked
              ? 'Entries are locked, so the organisers take the place out: they see your reason and confirm it. Until then it stays in the draw.'
              : 'The place goes, as declining a team does. The organisers see it, with your reason if you give one.'}
          </Text>
          <View className="gap-1.5">
            <Text className="font-inter-semibold text-[13px] text-ink-soft">
              Why?{locked ? '' : <Text className="font-inter text-xs text-ink-muted">  optional</Text>}
            </Text>
            <TextInput value={reason} onChangeText={setReason} multiline accessibilityLabel="Why?" placeholder="For the organisers." className={TEXT_INPUT} style={{ minHeight: 60, textAlignVertical: 'top' }} />
          </View>
          <TouchableOpacity onPress={() => setCannot(false)} accessibilityRole="button" className="self-start py-1">
            <Text className="font-inter-bold text-[13px] text-primary-ink">‹ Name a team instead</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View>
            <Text className="font-inter-semibold text-[13px] text-ink-soft pb-1">Team</Text>
            {sameAge.length ? sameAge.map(option) : <Text className="font-inter text-sm text-ink-muted py-1.5">No {division?.ageGroup || ''} team of yours in this sport.</Text>}
            {others.length ? (
              <>
                <Text className="font-inter text-xs text-ink-muted pt-2">From another age group</Text>
                {others.map(option)}
              </>
            ) : null}
          </View>
          <Text className="font-inter text-xs text-ink-muted">Its games keep their times and fields, and show this team from now on.</Text>
          <TouchableOpacity onPress={() => setCannot(true)} accessibilityRole="button" className="self-start py-1">
            <Text className="font-inter-bold text-[13px] text-primary-ink">We can't send a team…</Text>
          </TouchableOpacity>
        </>
      )}
    </EditDialog>
  );
}

/** The card's title: today's while teams to answer are all it holds. */
export function todoTitle(tasks: TodoTask[]) {
  if (tasks.every(t => t.kind === 'answer')) return tasks.length === 1 ? 'Your team is invited' : 'Your teams are invited';
  return 'To do';
}

/**
 * The Overview's card: the viewer's own tasks, at most five, then what is left — *2 more for
 * coaches · See all 9 ›*. Nothing to do, no card.
 */
export function TodoCard({ tasks, rows, orgId, eventName, orgName, onAnswerEach, onOpenGame, onChanged, onSeeAll }: {
  tasks: TodoTask[];
  rows: TodoRow[];
  orgId: string;
  eventName: string;
  orgName: (orgId?: string) => string;
  onAnswerEach: (participantOrgId: string) => void;
  onOpenGame: (gameId: string, pickFor?: string) => void;
  onChanged?: () => void;
  onSeeAll: () => void;
}) {
  if (!rows.length) return null;
  const own = rows.filter(r => r.mine);
  const shown = own.slice(0, TODO_CARD_LIMIT);
  const coaches = rows.length - own.length;
  const moreOfMine = own.length - shown.length;
  const left = [coaches ? `${coaches} more for coaches` : '', moreOfMine ? `${moreOfMine} more of yours` : ''].filter(Boolean).join(' · ');
  return (
    <View testID="todo-card" className="rounded-2xl border border-warning-line bg-card p-4 gap-1">
      <Text className="font-inter-bold text-[18px] text-ink">{todoTitle(tasks)}</Text>
      {shown.length ? (
        <TodoRows rows={shown} orgId={orgId} eventName={eventName} orgName={orgName} onAnswerEach={onAnswerEach} onOpenGame={onOpenGame} onChanged={onChanged} />
      ) : (
        <Text className="font-inter text-sm text-ink-muted py-1">Nothing for you — what is left is your coaches'.</Text>
      )}
      {rows.length > shown.length ? (
        <View className="flex-row flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-2.5 mt-1">
          <Text className="font-inter text-[13px] text-ink-muted">{left}</Text>
          <TouchableOpacity onPress={onSeeAll} accessibilityRole="link">
            <Text className="font-inter-bold text-[13px] text-primary-ink">See all {rows.length} ›</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}
