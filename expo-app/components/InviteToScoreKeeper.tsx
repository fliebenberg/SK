import React, { useEffect, useState } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  SocketAction,
  OrgProfile,
  OrgMinorsSettings,
  ProfileGuardian,
  RestrictedReason,
  isUnderAge,
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
import { formatInstant, type CalendarDate } from '../utils/dates';

/**
 * Inviting a person the organisation has on record to create a ScoreKeeper account.
 *
 * Anyone not on ScoreKeeper can be invited, with or without an email on file: the modal asks for
 * one, and the server saves it to the profile before sending, because signing up with that address
 * is what links the new account to the profile. The resend cooldown belongs to the address — see
 * `inviteCooldownRemainingHours` in `@sk/shared`.
 *
 * A minor is invited through their guardian (`MEMBER-3`): the modal offers each guardian as well as
 * the minor, starts on a guardian, and will not send to a minor the organisation's minors rule
 * restricts — the server refuses the same, since the account would link to a membership that grants
 * nothing.
 */

/** The fields of a person the invite needs. `OrgMember` and `TeamMember` both carry them. */
export interface InvitablePerson {
  id: string;
  name: string;
  email?: string;
  birthdate?: CalendarDate | null;
  userId?: string;
  hasAccount?: boolean;
  lastInviteSentAt?: string;
  lastInviteEmail?: string;
  /** Set on a minor whose membership carries no member privileges; such a person is not invited. */
  restrictedReason?: RestrictedReason | null;
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
  /** Called with the updated profile once the invite has gone **to `person`** — not to a guardian. */
  onSent?: (profile: OrgProfile) => void;
  /**
   * Offer to send again to an address still inside the cooldown, for an invite that went astray.
   * The person's profile passes it; lists do not, so a resend is always a deliberate visit.
   */
  allowResend?: boolean;
  /**
   * The person's active guardians (`MEMBER-3`). When there are any, the modal offers each of them as
   * well as the person, and starts on a guardian for a minor.
   */
  guardians?: ProfileGuardian[];
  /** The organisation's minors settings, for saying why a minor cannot be invited. */
  minorsSettings?: OrgMinorsSettings;
}

type Target = { kind: 'person' } | { kind: 'guardian'; linkId: string };

/** A guardian link as someone to invite. */
export function guardianAsPerson(link: ProfileGuardian): InvitablePerson {
  return {
    id: link.guardianProfileId,
    name: link.guardianName || 'Guardian',
    email: link.guardianEmail,
    hasAccount: link.guardianHasAccount,
    lastInviteSentAt: link.guardianLastInviteSentAt,
    lastInviteEmail: link.guardianLastInviteEmail,
  };
}

/** Why a minor may not be invited themselves, or `null` — the server refuses the same cases. */
function restrictionMessage(person: InvitablePerson, minorAge: number, hasGuardian: boolean): string | null {
  const instead = hasGuardian
    ? 'Invite their guardian instead.'
    : 'Record a guardian on their profile to invite them instead.';
  if (person.restrictedReason === 'org-off') {
    return `${person.name} is under ${minorAge}, and minors do not have member access in this organisation (Org Settings › Minors). ${instead}`;
  }
  if (person.restrictedReason === 'minor-off') {
    return `${person.name} has not been allowed their own access. ${instead}`;
  }
  return null;
}

const RELATIONSHIP_LABEL: Record<ProfileGuardian['relationship'], string> = {
  parent: 'Parent',
  guardian: 'Guardian',
  grandparent: 'Grandparent',
  other: 'Guardian',
};

export function InviteModal({
  person,
  cooldownHours,
  onClose,
  onSent,
  allowResend = false,
  guardians = [],
  minorsSettings,
}: InviteModalProps) {
  const isDark = useActiveTheme() === 'dark';
  const showSuccess = useToastStore(state => state.showSuccess);

  const [target, setTarget] = useState<Target>({ kind: 'person' });
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);

  const minorAge = minorsSettings?.minorAge ?? 18;
  const activeGuardians = guardians.filter(link => !link.endDate);
  const selectedLink = target.kind === 'guardian' ? activeGuardians.find(link => link.id === target.linkId) : undefined;

  // Open on the right person: a guardian for a minor — anyone the rule restricts, under the minor
  // age, or with a guardian at all — and the person themselves otherwise. Decided when the modal
  // opens on someone, not on every render, so a choice the admin makes stands.
  useEffect(() => {
    if (!person) return;
    const isMinor = Boolean(person.restrictedReason) || isUnderAge(person.birthdate, minorAge) || activeGuardians.length > 0;
    const first = activeGuardians.find(link => !link.guardianHasAccount) || activeGuardians[0];
    setTarget(isMinor && first ? { kind: 'guardian', linkId: first.id } : { kind: 'person' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person?.id]);

  const invitee: InvitablePerson | null = !person ? null : selectedLink ? guardianAsPerson(selectedLink) : person;

  // Start from the invitee's address each time the modal opens on someone, or switches to someone.
  useEffect(() => {
    setEmail(invitee?.email || '');
    setError('');
  }, [invitee?.id, invitee?.email]);

  if (!person || !invitee) return null;

  const blocked = selectedLink ? null : restrictionMessage(person, minorAge, activeGuardians.length > 0);
  const onScoreKeeper = isOnScoreKeeper(invitee);
  const typed = normalizeEmail(email);
  const onFile = normalizeEmail(invitee.email);
  const waitHours = typed ? inviteCooldownRemainingHours(invitee, typed, cooldownHours) : 0;
  const isResend = waitHours > 0 && allowResend;

  const handleSend = () => {
    if (blocked || onScoreKeeper) return;
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
      { memberId: invitee.id, email: typed, ...(isResend ? { resend: true } : {}) },
      { suppressToast: true }
    ).then(result => {
      setIsSending(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      showSuccess(`Invitation sent to ${typed}.`, invitee.name);
      // A guardian's invite changes the guardian's profile, which reaches the screen through the
      // guardians room; handing it to `onSent` would write their email over the person's.
      if (!selectedLink) onSent?.(result.data);
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
              {selectedLink
                ? `We'll email ${invitee.name} an invitation saying they are recorded as ${person.name}'s ${RELATIONSHIP_LABEL[selectedLink.relationship].toLowerCase()}. When they sign up with this address, they can see ${person.name}'s teams and fixtures.`
                : `${person.name} is not on ScoreKeeper yet. We'll email them an invitation to create an account. When they sign up with this address, the account is linked to their profile here.`}
            </Text>
          </View>

          {activeGuardians.length ? (
            <View>
              <Text className="font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">
                Who to invite
              </Text>
              <View className="space-y-1.5">
                {activeGuardians.map(link => (
                  <TargetOption
                    key={link.id}
                    label={link.guardianName || 'Guardian'}
                    detail={`${RELATIONSHIP_LABEL[link.relationship]}${link.isPrimary ? ' · primary' : ''}${link.guardianHasAccount ? ' · already on ScoreKeeper' : ''}`}
                    selected={selectedLink?.id === link.id}
                    disabled={isSending || !!link.guardianHasAccount}
                    onPress={() => setTarget({ kind: 'guardian', linkId: link.id })}
                    isDark={isDark}
                  />
                ))}
                <TargetOption
                  label={`${person.name} directly`}
                  detail={restrictionMessage(person, minorAge, true) ? 'Not allowed — see below' : 'Their own account'}
                  selected={!selectedLink}
                  disabled={isSending}
                  onPress={() => setTarget({ kind: 'person' })}
                  isDark={isDark}
                />
              </View>
            </View>
          ) : null}

          {blocked ? (
            <View className="flex-row gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <Ionicons name="lock-closed-outline" size={16} color="#F59E0B" />
              <Text className="flex-1 font-inter text-xs text-amber-700 dark:text-amber-300 leading-relaxed">{blocked}</Text>
            </View>
          ) : onScoreKeeper ? (
            <Text className="font-inter text-xs text-emerald-600 dark:text-emerald-400">{invitee.name} is already on ScoreKeeper.</Text>
          ) : (
            <>
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
                      ? `This replaces ${invitee.email} on their profile.`
                      : 'This address will be saved to their profile.'}
                  </Text>
                ) : null}
              </View>

              {isResend ? (
                <View className="flex-row gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <Ionicons name="refresh-outline" size={16} color="#F59E0B" />
                  <Text className="flex-1 font-inter text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                    An invite already went to this address on {formatInstant(invitee.lastInviteSentAt)}.
                    Only send it again if {invitee.name} says it did not arrive, and ask them to check
                    their spam folder.
                  </Text>
                </View>
              ) : invitee.lastInviteSentAt && invitee.lastInviteEmail ? (
                <Text className="font-inter text-[11px] text-slate-500 dark:text-slate-400">
                  Last invited {formatInstant(invitee.lastInviteSentAt)} to {invitee.lastInviteEmail}.
                  {waitHours > 0
                    ? ` You can send to this address again in ${formatInviteWait(waitHours)}, or to a different one now. To resend it sooner, use their profile.`
                    : ''}
                </Text>
              ) : null}
            </>
          )}

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
              disabled={isSending || !!blocked || onScoreKeeper || (waitHours > 0 && !allowResend)}
              className="flex-1 min-h-[40px] py-2"
            />
          </View>
        </GlassCard>
      </View>
    </Modal>
  );
}

function TargetOption({ label, detail, selected, disabled, onPress, isDark }: {
  label: string;
  detail: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  isDark: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{
        borderWidth: 1,
        borderColor: selected ? '#FF3E00' : (isDark ? 'rgba(255,255,255,0.1)' : '#CBD5E1'),
        opacity: disabled && !selected ? 0.5 : 1,
      }}
      className="flex-row items-center gap-3 rounded-xl px-3 py-2.5"
    >
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={16} color={selected ? '#FF3E00' : '#94A3B8'} />
      <View className="flex-1">
        <Text className="font-inter-bold text-sm text-slate-800 dark:text-white">{label}</Text>
        <Text className="font-inter text-[11px] text-slate-500 dark:text-slate-400">{detail}</Text>
      </View>
    </TouchableOpacity>
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
