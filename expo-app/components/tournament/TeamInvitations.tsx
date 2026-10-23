import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { SocketAction, TeamEntry } from '@sk/shared';
import { ConfirmationModal } from '../ConfirmationModal';
import { EntrantBadge } from './DivisionEntries';
import { sendAction } from '../../services/actions';
import { formatDateRange } from '../../utils/dates';

/**
 * A team's Events card (`FIX-31`, option B on `mockups/team-invitations.html`): every tournament the
 * team is in, with where it stands. An invitation still to answer is a tinted row with *✓ Accept* and
 * *✕ Decline* for whoever answers for the team; every other row carries its answer. A redesign of the
 * team's events and games together is `FIX-35`.
 */
export function TeamEventsCard({ entries, canAnswer, orgId, onAnswered, onOpenEvent }: {
  entries: TeamEntry[];
  /** Its coach, or an admin of its organisation. */
  canAnswer: boolean;
  /** The acting workspace. */
  orgId: string;
  onAnswered: () => void;
  onOpenEvent: (eventId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState<TeamEntry | null>(null);
  const answer = async (e: TeamEntry, value: 'accepted' | 'declined') => {
    setBusy(true);
    const result = await sendAction(SocketAction.SET_ENTRANT_ANSWER, { divisionId: e.divisionId, entrantId: e.id, orgId, answer: value });
    setBusy(false);
    if (result.ok) { setDeclining(null); onAnswered(); }
  };
  if (!entries.length) return null;
  const answerable = (e: TeamEntry) => canAnswer && e.status === 'invited' && !e.entriesLocked && e.orgInvitation !== 'declined' && e.orgInvitation !== 'withdrawn';
  const waiting = entries.filter(e => answerable(e) && e.orgInvitation === 'invited');
  return (
    <View className="rounded-2xl border border-line bg-card p-4 gap-2">
      <View className="flex-row items-baseline gap-2">
        <Text className="font-inter-bold text-[18px] text-ink">Competitions</Text>
        <Text className="font-inter text-[15px] text-ink-muted">{entries.length}</Text>
      </View>
      {entries.map(e => {
        const open = answerable(e);
        const when = formatDateRange(e.eventStartDate, e.eventEndDate);
        return (
          <View key={e.id} testID={`team-entry-${e.id}`} className={`flex-row flex-wrap items-center gap-x-3 gap-y-2 py-2 ${open ? 'bg-warning-soft rounded-xl px-2.5 my-0.5' : 'border-t border-line-soft'}`}>
            <TouchableOpacity onPress={() => onOpenEvent(e.eventId)} accessibilityRole="link" className="flex-1" style={{ minWidth: 180 }}>
              <Text className="font-inter-bold text-sm text-ink">{e.eventName}</Text>
              <Text className="font-inter text-xs text-ink-muted">{[e.divisionName, when, e.hostOrgName ? (open ? `invited by ${e.hostOrgName}` : e.hostOrgName) : null].filter(Boolean).join(' · ')}</Text>
            </TouchableOpacity>
            {open ? (
              <View className="flex-row gap-2">
                <TouchableOpacity onPress={() => answer(e, 'accepted')} disabled={busy} accessibilityRole="button" className="rounded-xl bg-primary px-3 py-1.5">
                  <Text className="font-inter-bold text-[13px] text-on-primary">✓ Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setDeclining(e)} disabled={busy} accessibilityRole="button" className="rounded-xl border border-line-strong bg-card px-3 py-1.5">
                  <Text className="font-inter-bold text-[13px] text-ink">✕ Decline</Text>
                </TouchableOpacity>
              </View>
            ) : <EntrantBadge status={e.status} />}
          </View>
        );
      })}
      {waiting.length ? (
        <Text className="font-inter text-xs text-ink-muted">Your organisation has not accepted {waiting.length === 1 ? 'that invitation' : 'those invitations'} yet, so until it does, only your organisation will see if you accept.</Text>
      ) : null}
      <ConfirmationModal
        isOpen={!!declining}
        title={`Decline ${declining?.eventName || 'the tournament'} for ${declining?.name || 'your team'}?`}
        description="Your organisation's admins can still change it while entries are open."
        confirmText="✕ Decline"
        cancelText="Cancel"
        variant="danger"
        isProcessing={busy}
        onConfirm={() => declining && answer(declining, 'declined')}
        onClose={() => setDeclining(null)}
      />
    </View>
  );
}
