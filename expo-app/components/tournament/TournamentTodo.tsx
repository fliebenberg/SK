import React, { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Event, SocketAction, Sport, TournamentDivision, TournamentEntrant, divisionFullName, hasLeft } from '@sk/shared';
import { ConfirmationModal } from '../ConfirmationModal';
import { EntrantBadge } from './DivisionEntries';
import { sendAction } from '../../services/actions';
import { useAuthStore } from '../../store/authStore';

/**
 * **To do** — what a taking-part organisation still owes a tournament (`FIX-24`, agreed 2026-10-18 on
 * `mockups/tournament-participant.html`; docs/events.md §7). It grows out of the *Your teams are
 * invited* card, in the same place under the banner, and lists what the viewer answers for: a
 * coach's own teams, every team of an organisation they admin — whatever the view switch shows.
 *
 * Each task is the viewer's own or a coach's. **An admin's own** are what only an admin can do, then
 * team tasks for a team with no coach; the rest are its coaches'. The Overview's card holds only the
 * viewer's own, at most five, and says how many more there are; *See all* opens the tournament's
 * To do page, which holds everything. Today the one task is a team to answer; naming a TBC place and
 * picking a team per game join it with `FIX-32`.
 */

export type TodoKind = 'answer';

export interface TodoTask {
  key: string;
  kind: TodoKind;
  entrant: TournamentEntrant;
  sportId?: string;
  sportName: string;
  /** The team, as the organisation knows it. */
  teamName: string;
  divisionName: string;
  /** The viewer's own to do, rather than one of the organisation's coaches'. */
  mine: boolean;
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

const KIND_ORDER: Record<TodoKind, number> = { answer: 0 };
const ACTIVE = (m: any) => !m.endDate || new Date(m.endDate) > new Date();

/** Everything the viewer may still need to do in this tournament, in order. */
export function useTournamentTodo({ event, divisions, entrants, canEdit, sports }: {
  event: Event;
  divisions: TournamentDivision[];
  entrants: TournamentEntrant[];
  /** An organiser: their work is the tournament's own, not this list. */
  canEdit: boolean;
  sports: Sport[];
}): { tasks: TodoTask[]; rows: TodoRow[] } {
  const orgMemberships = useAuthStore((state: any) => state.orgMemberships) || [];
  const teamMemberships = useAuthStore((state: any) => state.teamMemberships) || [];
  return useMemo(() => {
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
    for (const e of entrants) {
      const division = divisionOf(e.divisionId);
      // A team to answer: invited, its division still open, its organisation still in it, and the
      // viewer its coach or an admin of its organisation (`FIX-31`). Only an admin's to do, or the coach's.
      if (e.status !== 'invited' || !division || division.entriesLockedAt || hasLeft(invitationOf(e.orgId) || 'accepted')) continue;
      const asAdmin = adminsOrg(e.orgId);
      if (!asAdmin && !(e.teamId && coachTeamIds.has(e.teamId))) continue;
      tasks.push({
        key: `answer:${e.id}`, kind: 'answer', entrant: e,
        sportId: division.sportId || undefined, sportName: sportName(division.sportId),
        teamName: e.name || 'Your team', divisionName: divisionFullName(division.name, sportName(division.sportId)),
        mine: true,
      });
    }
    tasks.sort((a, b) => (Number(b.mine) - Number(a.mine)) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
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
  }, [canEdit, entrants, divisions, event, orgMemberships, teamMemberships, sports]);
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
export function TodoRows({ rows, orgId, eventName, orgName, onAnswerEach, showWhose = false }: {
  rows: TodoRow[];
  /** The acting workspace. */
  orgId: string;
  eventName: string;
  orgName: (orgId?: string) => string;
  /** *Answer each ›* on a line of many teams: the organisation's page in the tournament. */
  onAnswerEach: (participantOrgId: string) => void;
  /** On the page: say whose a task is when it is not the viewer's. */
  showWhose?: boolean;
}) {
  const { busy, declining, setDeclining, answer } = useAnswers(orgId);
  return (
    <View>
      {rows.map((row, i) => {
        const first = row.tasks[0];
        const many = row.tasks.length > 1;
        return (
          <View
            key={row.key}
            testID={many ? `todo-answers-${first.entrant.orgId}` : `team-invite-${first.entrant.id}`}
            className={`flex-row flex-wrap items-center gap-x-3 gap-y-2 py-2 ${i ? 'border-t border-line-soft' : ''}`}
          >
            <View className="flex-1" style={{ minWidth: 180 }}>
              <Text className="font-inter-bold text-sm text-ink">{many ? `${row.tasks.length} teams to answer` : first.teamName}</Text>
              {many ? (
                <Text className="font-inter text-xs text-ink-muted">
                  {row.tasks.map((t, k) => (
                    <Text key={t.key} testID={`team-invite-${t.entrant.id}`}>{k ? ', ' : ''}{t.divisionName} {t.teamName}</Text>
                  ))}
                </Text>
              ) : (
                <Text className="font-inter text-xs text-ink-muted">{first.divisionName}{showWhose && !row.mine ? ' · its coach’s' : ''}</Text>
              )}
            </View>
            {many ? (
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
    </View>
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
export function TodoCard({ tasks, rows, orgId, eventName, orgName, onAnswerEach, onSeeAll }: {
  tasks: TodoTask[];
  rows: TodoRow[];
  orgId: string;
  eventName: string;
  orgName: (orgId?: string) => string;
  onAnswerEach: (participantOrgId: string) => void;
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
        <TodoRows rows={shown} orgId={orgId} eventName={eventName} orgName={orgName} onAnswerEach={onAnswerEach} />
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
