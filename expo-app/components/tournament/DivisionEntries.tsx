import React, { useEffect, useState } from 'react';
import { Switch, Text, TouchableOpacity, View } from 'react-native';
import {
  EntrantStatus,
  EntryLockGaps,
  Event,
  TournamentDivision,
  TournamentEntrant,
  divisionAllowsOrgAdding,
} from '@sk/shared';
import { formatInstantDate } from '../../utils/dates';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';

/**
 * A team's answer and a division's entries (`FIX-31`, `FIX-33`; agreed on
 * `mockups/division-read-first.html` and `mockups/team-invitations.html`): the pieces the division
 * page and an organisation's page share — a team's badge, a request waiting for the organisers, the
 * line that says whether organisations may add teams, and the lock.
 */

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One set of words for a team's answer, wherever it shows. */
export const ENTRANT_LABEL: Record<EntrantStatus | 'not_invited', string> = {
  not_invited: 'Not invited yet',
  invited: 'Invited',
  accepted: 'Accepted',
  declined: 'Declined',
  withdrawal_pending: 'Withdrawal pending',
  withdrawn: 'Withdrawn',
  requested: 'Asks to enter',
  rejected: 'Turned down',
};
const ENTRANT_TONE: Record<EntrantStatus | 'not_invited', [string, string]> = {
  not_invited: ['bg-warning-soft', 'text-warning-ink'],
  invited: ['bg-info-soft', 'text-info-ink'],
  accepted: ['bg-success-soft', 'text-success-ink'],
  declined: ['bg-danger-soft', 'text-danger-ink'],
  withdrawal_pending: ['bg-warning-soft', 'text-warning-ink'],
  withdrawn: ['bg-sunken', 'text-ink-muted'],
  requested: ['bg-warning-soft', 'text-warning-ink'],
  rejected: ['bg-danger-soft', 'text-danger-ink'],
};

/** A team's answer as a badge — the shown one (`entrantStatusShown`), not necessarily the stored. */
export function EntrantBadge({ status }: { status: EntrantStatus | 'not_invited' }) {
  const [box, text] = ENTRANT_TONE[status];
  return (
    <View className={`rounded-full px-2 py-0.5 flex-shrink-0 ${box}`}>
      <Text className={`font-inter-semibold text-[11px] ${text}`}>{ENTRANT_LABEL[status]}</Text>
    </View>
  );
}

/** What someone wrote: two lines, then Show more / Show less (design rule 27). */
export function WrittenReason({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  return (
    <View className="gap-0.5">
      <Text
        className="font-inter italic text-[13px] text-ink-soft"
        numberOfLines={open ? undefined : 2}
        onTextLayout={e => { if (!open && e.nativeEvent.lines.length >= 2) setLong(true); }}
      >
        “{text}”
      </Text>
      {long ? (
        <TouchableOpacity onPress={() => setOpen(o => !o)} accessibilityRole="button" className="self-start">
          <Text className="font-inter-bold text-xs text-primary-ink">{open ? 'Show less' : 'Show more'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** Who asked and when, for a request row: "Asked Thu 9 Oct by Maria Nel". */
export function askedLine(entrant: TournamentEntrant, extra?: string) {
  const when = formatInstantDate(entrant.requestedAt);
  const who = entrant.requestedBy?.name;
  return [`Asked${when ? ` ${when}` : ''}${who ? ` by ${who}` : ''}`, extra].filter(Boolean).join(' · ');
}

/**
 * A request waiting for the organisers, at the top of the Teams card, tinted: a team an organisation
 * added or asked to enter late — ✓ Accept / Turn down — or a withdrawal — Confirm withdrawal / Keep
 * them in. Its reason shows two lines, then Show more.
 */
export function RequestRow({ entrant, crest, sub, onAccept, onDecline, acceptLabel, declineLabel, busy }: {
  entrant: TournamentEntrant;
  crest: React.ReactNode;
  sub: string;
  onAccept?: () => void;
  onDecline?: () => void;
  acceptLabel: string;
  declineLabel: string;
  busy?: boolean;
}) {
  return (
    <View testID={`request-${entrant.id}`} className="rounded-xl bg-warning-soft border border-warning-line px-3 py-2.5 gap-2 my-1">
      <View className="flex-row items-center gap-2.5">
        {crest}
        <View className="flex-1 min-w-0">
          <Text numberOfLines={1} className="font-inter-semibold text-sm text-ink">{entrant.name || entrant.label || 'A team'}</Text>
          <Text numberOfLines={2} className="font-inter text-xs text-ink-muted">{sub}</Text>
        </View>
        <EntrantBadge status={entrant.status} />
      </View>
      {entrant.reason ? <WrittenReason text={entrant.reason} /> : null}
      {onAccept || onDecline ? (
        <View className="flex-row flex-wrap gap-2">
          {onAccept ? (
            <TouchableOpacity onPress={onAccept} disabled={busy} accessibilityRole="button" className="rounded-xl bg-primary px-3.5 py-1.5">
              <Text className="font-inter-bold text-[13px] text-on-primary">{acceptLabel}</Text>
            </TouchableOpacity>
          ) : null}
          {onDecline ? (
            <TouchableOpacity onPress={onDecline} disabled={busy} accessibilityRole="button" className="rounded-xl border border-line-strong bg-card px-3.5 py-1.5">
              <Text className="font-inter-bold text-[13px] text-ink-soft">{declineLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * *Organisations can add their own teams* (`FIX-33`), with its toggle — the same line on the
 * tournament's Organisations & teams card (`onChange` the event's setting) and a division's Teams
 * card, where it says whether it follows the tournament and offers the way back once overridden.
 */
export function OrgAddingLine({ division, event, onChange, onFollow, busy }: {
  /** Absent on the tournament's card: the tournament's own setting. */
  division?: Pick<TournamentDivision, 'orgsMayAddTeams'>;
  event: Pick<Event, 'orgsMayAddTeams'>;
  /** Resolves to whether the save went through. */
  onChange: (allow: boolean) => Promise<boolean>;
  /** A division's way back to following the tournament. */
  onFollow?: () => void;
  busy?: boolean;
}) {
  const isDark = useActiveTheme() === 'dark';
  const tournamentOn = !!event.orgsMayAddTeams;
  const saved = division ? divisionAllowsOrgAdding(division, event) : tournamentOn;
  // The switch flips as soon as it is tapped, but the saved setting only changes once the server's
  // update arrives; until then the tapped value is held, or the switch would jump back in between.
  const [pending, setPending] = useState<boolean | null>(null);
  useEffect(() => { if (pending !== null && saved === pending) setPending(null); }, [saved, pending]);
  const on = pending ?? saved;
  const change = async (allow: boolean) => {
    setPending(allow);
    if (!(await onChange(allow))) setPending(null);
  };
  const own = division && division.orgsMayAddTeams !== null && division.orgsMayAddTeams !== undefined;
  return (
    <View className="flex-row items-center gap-3 pt-3 mt-1 border-t border-line-soft">
      <View className="flex-1 min-w-0">
        <Text className="font-inter-semibold text-sm text-ink">Organisations can add their own teams</Text>
        {division ? (
          own ? (
            <Text className="font-inter text-xs text-ink-muted">
              {on ? 'On' : 'Off'} for this division ·{' '}
              <Text onPress={busy ? undefined : onFollow} accessibilityRole="button" className="font-inter-bold text-primary-ink">
                Use the tournament's setting ({tournamentOn ? 'on' : 'off'})
              </Text>
            </Text>
          ) : (
            <Text className="font-inter text-xs text-ink-muted">Same as the tournament: {tournamentOn ? 'on' : 'off'}</Text>
          )
        ) : (
          <Text className="font-inter text-xs text-ink-muted">Each one waits for your approval. A division can choose differently.</Text>
        )}
      </View>
      <Switch
        value={on}
        disabled={busy}
        onValueChange={change}
        trackColor={{ true: themeColor(isDark, 'primary') }}
        accessibilityLabel="Organisations can add their own teams"
      />
    </View>
  );
}

/** What is left before the lock, as one line: "2 teams still to answer · 1 added team to approve". */
export function lockGapsLine(gaps: EntryLockGaps): string {
  const parts: string[] = [];
  if (gaps.invited.length) {
    parts.push(`${plural(gaps.invited.length, 'team')} still to answer${gaps.notInvited.length ? ` (${gaps.notInvited.length === gaps.invited.length ? (gaps.invited.length === 1 ? 'not invited yet' : 'none invited yet') : `${gaps.notInvited.length} not invited yet`})` : ''}`);
  }
  if (gaps.requested.length) parts.push(`${plural(gaps.requested.length, 'added team')} to approve`);
  if (gaps.orgNotIn.length) {
    parts.push(`${plural(gaps.orgNotIn.length, 'team')} whose organisation has not accepted`);
  }
  return parts.join(' · ');
}

/**
 * The foot of the Teams card: whether entries are open or locked (`FIX-31`). Open, it says what is
 * left and offers Lock entries — disabled, with the count, while anything waits. Locked, it says
 * when and by whom, what the lock means, and offers Unlock.
 */
export function DivisionLockBar({ division, gaps, canEdit, onLock, onUnlock, busy }: {
  division: Pick<TournamentDivision, 'entriesLockedAt' | 'entriesLockedBy'>;
  gaps: EntryLockGaps;
  canEdit: boolean;
  onLock: () => void;
  onUnlock: () => void;
  busy?: boolean;
}) {
  if (division.entriesLockedAt) {
    const when = formatInstantDate(division.entriesLockedAt);
    return (
      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1.5 pt-3 mt-1 border-t border-line-soft">
        <View className="flex-1" style={{ minWidth: 200 }}>
          <Text className="font-inter text-sm text-ink-soft">
            <Text className="font-inter-bold text-ink">🔒 Entries locked</Text>
            {when ? ` ${when}` : ''}{division.entriesLockedBy?.name ? ` by ${division.entriesLockedBy.name}` : ''}.
          </Text>
          <Text className="font-inter text-xs text-ink-muted">A team now leaves only by withdrawing; an organisation can ask to enter late.</Text>
        </View>
        {canEdit ? (
          <TouchableOpacity onPress={onUnlock} disabled={busy} accessibilityRole="button" className="py-1">
            <Text className="font-inter-bold text-[13px] text-primary-ink">Unlock</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }
  const ready = gaps.total === 0;
  return (
    <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1.5 pt-3 mt-1 border-t border-line-soft">
      <View className="flex-1" style={{ minWidth: 200 }}>
        <Text className="font-inter text-sm text-ink-soft">
          <Text className="font-inter-bold text-ink">Entries open.</Text> Either side can still change a team's answer.
        </Text>
        <Text className="font-inter text-xs text-ink-muted">
          {ready ? 'Everyone has answered: the entries can be locked.' : `Lock entries once everything is answered — ${lockGapsLine(gaps)}.`}
        </Text>
      </View>
      {canEdit ? (
        <TouchableOpacity
          onPress={onLock}
          disabled={!ready || busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready || busy }}
          className={`rounded-xl border px-3.5 py-1.5 ${ready ? 'border-line-strong bg-card' : 'border-line bg-sunken'}`}
        >
          <Text className={`font-inter-bold text-[13px] ${ready ? 'text-ink' : 'text-ink-muted'}`}>🔒 Lock entries</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
