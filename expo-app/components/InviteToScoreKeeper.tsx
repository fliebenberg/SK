import React, { useEffect, useState } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  SocketAction,
  OrgProfile,
  formatInviteWait,
  inviteCooldownHoursFrom,
  inviteCooldownRemainingHours,
  isValidEmail,
  normalizeEmail,
} from '@sk/shared';
import { GlassCard } from './GlassCard';
import { Button } from './Button';
import { sendAction } from '../services/actions';
import { useSocketQuery } from '../hooks/useSocketQuery';
import { useActiveTheme } from '../store/settingsStore';
import { useToastStore } from '../store/toastStore';
import { formatInstant, isYoungerThan } from '../utils/dates';

/** Under this age, the invite warns that a parent or guardian should agree first (`MEMBER-3`). */
const ADULT_AGE = 18;

/**
 * Inviting a person the organisation has on record to create a ScoreKeeper account.
 *
 * Anyone not on ScoreKeeper can be invited, with or without an email on file: the modal asks for
 * one, and the server saves it to the profile before sending, because signing up with that address
 * is what links the new account to the profile. The resend cooldown belongs to the address — see
 * `inviteCooldownRemainingHours` in `@sk/shared`.
 */

/** The fields of a person the invite needs. `OrgMember` and `TeamMember` both carry them. */
export interface InvitablePerson {
  id: string;
  name: string;
  email?: string;
  birthdate?: string;
  userId?: string;
  hasAccount?: boolean;
  lastInviteSentAt?: string;
  lastInviteEmail?: string;
}

/** True when the person has an account, so there is nobody to invite. */
export function isOnScoreKeeper(person: InvitablePerson): boolean {
  return Boolean(person.hasAccount || person.userId);
}

/** The resend cooldown from `system_settings`. */
export function useInviteCooldownHours(): number {
  const { data } = useSocketQuery<Record<string, any>>('system_settings', {}, { suppressToast: true });
  return inviteCooldownHoursFrom(data);
}

/**
 * An invite has gone to the person's current address and they have not signed up yet. Once their
 * email changes, the old invite no longer counts: it went somewhere they will not sign up from.
 */
export function isInvitePending(person: InvitablePerson): boolean {
  return Boolean(
    !isOnScoreKeeper(person) &&
    person.lastInviteSentAt &&
    person.lastInviteEmail &&
    normalizeEmail(person.lastInviteEmail) === normalizeEmail(person.email)
  );
}

/** Hours until the person's current address may be invited again; `0` means now. */
export function inviteWaitHours(person: InvitablePerson, cooldownHours: number): number {
  return inviteCooldownRemainingHours(person, person.email, cooldownHours);
}

interface InviteButtonProps {
  person: InvitablePerson;
  cooldownHours: number;
  /** Opens the screen's {@link InviteModal} for this person. */
  onPress: () => void;
}

/**
 * The compact Invite pill for a row in a list. Renders nothing for someone already on ScoreKeeper.
 *
 * "Invite" when nothing has gone to their address, "Invite Pending" while an invite has and the
 * cooldown runs, "Re-invite" once it has run out. "Invite Pending" still opens the modal, because a
 * different address may be sent to at once; resending to the *same* address inside the cooldown is offered
 * only on the person's profile ({@link InviteModal}'s `allowResend`).
 */
export function InviteButton({ person, cooldownHours, onPress }: InviteButtonProps) {
  if (isOnScoreKeeper(person)) return null;

  const waitHours = inviteWaitHours(person, cooldownHours);
  const label = waitHours > 0 ? 'Invite Pending' : isInvitePending(person) ? 'Re-invite' : 'Invite';

  return (
    <TouchableOpacity
      onPress={(e: any) => {
        if (e && e.stopPropagation) e.stopPropagation();
        onPress();
      }}
      className={`px-2 py-1 rounded-lg active:scale-95 ${
        waitHours > 0 ? 'bg-slate-200 dark:bg-slate-800' : 'bg-brand-orange'
      }`}
    >
      <Text className={`font-orbitron-bold text-[8px] uppercase tracking-widest ${
        waitHours > 0 ? 'text-slate-500 dark:text-slate-400' : 'text-white'
      }`}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

interface InviteModalProps {
  /** Who to invite; `null` keeps the modal closed. One modal serves a whole screen. */
  person: InvitablePerson | null;
  cooldownHours: number;
  onClose: () => void;
  /** Called with the updated profile once the invite has gone. */
  onSent?: (profile: OrgProfile) => void;
  /**
   * Offer to send again to an address still inside the cooldown, for an invite that went astray.
   * The person's profile passes it; lists do not, so a resend is always a deliberate visit.
   */
  allowResend?: boolean;
}

export function InviteModal({ person, cooldownHours, onClose, onSent, allowResend = false }: InviteModalProps) {
  const isDark = useActiveTheme() === 'dark';
  const showSuccess = useToastStore(state => state.showSuccess);

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Start from the profile's address each time the modal opens on someone.
  useEffect(() => {
    setEmail(person?.email || '');
    setError('');
  }, [person?.id, person?.email]);

  if (!person) return null;

  const typed = normalizeEmail(email);
  const onFile = normalizeEmail(person.email);
  const waitHours = typed ? inviteCooldownRemainingHours(person, typed, cooldownHours) : 0;
  const isResend = waitHours > 0 && allowResend;
  const minor = isYoungerThan(person.birthdate, ADULT_AGE);

  const handleSend = () => {
    if (!typed) {
      setError('Enter the email address to send the invitation to.');
      return;
    }
    if (!isValidEmail(typed)) {
      setError('That is not a valid email address.');
      return;
    }

    setIsSending(true);
    setError('');
    sendAction(
      SocketAction.SEND_MEMBER_INVITE,
      { memberId: person.id, email: typed, ...(isResend ? { resend: true } : {}) },
      { suppressToast: true }
    ).then(result => {
      setIsSending(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      showSuccess(`Invitation sent to ${typed}.`, person.name);
      onSent?.(result.data);
      onClose();
    });
  };

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-slate-950/75 items-center justify-center p-6">
        <GlassCard
          className="w-full max-w-sm border border-slate-200 dark:border-white/10 p-6 space-y-4 shadow-lg"
          style={{ backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }}
        >
          <View className="items-center">
            <View className="w-12 h-12 rounded-full items-center justify-center mb-3 bg-brand-orange/10">
              <Ionicons name="mail-outline" size={24} color="#FF3E00" />
            </View>
            <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white uppercase tracking-wider text-center">
              Invite to ScoreKeeper
            </Text>
            <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 text-center mt-2 leading-relaxed">
              {person.name} is not on ScoreKeeper yet. We'll email them an invitation to create an
              account. When they sign up with this address, the account is linked to their profile here.
            </Text>
          </View>

          {minor ? (
            <View className="flex-row gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <Ionicons name="alert-circle-outline" size={16} color="#F59E0B" />
              <Text className="flex-1 font-inter text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                {person.name} is under 18. Check with a parent or guardian before inviting them, and
                use an address they have agreed to.
              </Text>
            </View>
          ) : null}

          <View>
            <Text className="font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">
              Email Address
            </Text>
            <TextInput
              value={email}
              onChangeText={text => {
                setEmail(text);
                setError('');
              }}
              placeholder="email@example.com"
              placeholderTextColor="#94A3B8"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSending}
              className="font-inter text-sm text-slate-800 dark:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 outline-none"
            />
            {typed && typed !== onFile ? (
              <Text className="font-inter text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                {onFile
                  ? `This replaces ${person.email} on their profile.`
                  : 'This address will be saved to their profile.'}
              </Text>
            ) : null}
          </View>

          {isResend ? (
            <View className="flex-row gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <Ionicons name="refresh-outline" size={16} color="#F59E0B" />
              <Text className="flex-1 font-inter text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                An invite already went to this address on {formatInstant(person.lastInviteSentAt)}.
                Only send it again if {person.name} says it did not arrive, and ask them to check
                their spam folder.
              </Text>
            </View>
          ) : person.lastInviteSentAt && person.lastInviteEmail ? (
            <Text className="font-inter text-[11px] text-slate-500 dark:text-slate-400">
              Last invited {formatInstant(person.lastInviteSentAt)} to {person.lastInviteEmail}.
              {waitHours > 0
                ? ` You can send to this address again in ${formatInviteWait(waitHours)}, or to a different one now. To resend it sooner, use their profile.`
                : ''}
            </Text>
          ) : null}

          {error ? (
            <Text className="font-inter text-xs text-red-500">{error}</Text>
          ) : null}

          <View className="flex-row gap-3 pt-2">
            <Button
              title="Cancel"
              variant="ghost"
              onPress={onClose}
              disabled={isSending}
              className="flex-1 min-h-[40px] py-2"
            />
            <Button
              title={isResend ? 'Resend Invite' : 'Send Invite'}
              variant="primary"
              onPress={handleSend}
              isLoading={isSending}
              disabled={isSending || (waitHours > 0 && !allowResend)}
              className="flex-1 min-h-[40px] py-2"
            />
          </View>
        </GlassCard>
      </View>
    </Modal>
  );
}

interface InviteStatusCardProps {
  person: InvitablePerson;
  cooldownHours: number;
  /** Whether the viewer may send invites — org admins and staff. */
  canInvite: boolean;
  /** Shown instead of the button when it is there but may not be used yet. */
  blockedReason?: string;
  onInvite: () => void;
}

/**
 * A person's standing on ScoreKeeper, for their profile: whether they have an account, and if not,
 * whether an invite is pending, when it went and to which address. Its button is always there for
 * someone not on ScoreKeeper — pair it with an {@link InviteModal} that has `allowResend`, so an
 * invite that went astray can be sent again without waiting out the cooldown.
 */
export function InviteStatusCard({ person, cooldownHours, canInvite, blockedReason, onInvite }: InviteStatusCardProps) {
  const onScoreKeeper = isOnScoreKeeper(person);
  const waitHours = inviteWaitHours(person, cooldownHours);
  const pending = isInvitePending(person);

  let status: string;
  let detail: string;
  if (onScoreKeeper) {
    status = 'On ScoreKeeper';
    detail = 'Has a ScoreKeeper account, linked to this profile.';
  } else if (pending) {
    status = 'Invite pending';
    detail = `Sent ${formatInstant(person.lastInviteSentAt)} to ${person.lastInviteEmail}.`;
    if (waitHours > 0) detail += ' If it did not arrive, you can resend it now.';
  } else {
    status = 'Not on ScoreKeeper yet';
    detail = person.lastInviteSentAt && person.lastInviteEmail
      ? `An earlier invite went to ${person.lastInviteEmail}, which is no longer their email.`
      : 'Not invited yet.';
  }

  return (
    <View className="flex-row items-center gap-3">
      <View className={`w-8 h-8 rounded-lg items-center justify-center ${onScoreKeeper ? 'bg-emerald-500/10' : 'bg-slate-100 dark:bg-white/5'}`}>
        <Ionicons
          name={onScoreKeeper ? 'checkmark-circle-outline' : 'person-add-outline'}
          size={16}
          color={onScoreKeeper ? '#10B981' : '#94A3B8'}
        />
      </View>
      <View className="flex-1">
        <Text className="font-inter-bold text-[10px] text-slate-400 uppercase tracking-wider">ScoreKeeper Account</Text>
        <Text className="font-inter text-sm text-slate-800 dark:text-white mt-0.5">
          {status}
        </Text>
        <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mt-0.5">{detail}</Text>
        {!onScoreKeeper && canInvite && blockedReason ? (
          <Text className="font-inter text-xs text-amber-600 dark:text-amber-400 mt-0.5">{blockedReason}</Text>
        ) : null}
      </View>
      {!onScoreKeeper && canInvite ? (
        <TouchableOpacity
          onPress={onInvite}
          disabled={Boolean(blockedReason)}
          className={`px-3 py-2 rounded-xl active:scale-95 ${blockedReason ? 'bg-slate-200 dark:bg-slate-800 opacity-60' : 'bg-brand-orange'}`}
        >
          <Text className={`font-orbitron-bold text-[9px] uppercase tracking-widest ${blockedReason ? 'text-slate-500 dark:text-slate-400' : 'text-white'}`}>
            {pending ? 'Resend' : 'Invite'}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
