import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OrgMinorsSettings, ProfileGuardian, RestrictedReason, SocketAction, isMinorIn, isUnderAge } from '@sk/shared';
import { sendAction } from '../../services/actions';
import { formatInstant } from '../../utils/dates';
import { ReadCard } from '../ReadCard';
import { SegmentedControl } from '../SegmentedControl';
import { themeColor } from '../../constants/Colors';
import { useActiveTheme } from '../../store/settingsStore';

interface MinorAccessCardProps {
  player: {
    id: string;
    birthdate?: string | null;
    ownAccountAllowed?: boolean | null;
    ownAccountSetAt?: string | null;
    ownAccountSetBy?: string | null;
    restrictedReason?: RestrictedReason | null;
  };
  settings: OrgMinorsSettings;
  guardians: ProfileGuardian[];
  /** An org Admin — who may set the value only while the player has no guardian. */
  isOrgAdmin: boolean;
  /** A name for the profile that last set the value, when it is not one of the guardians. */
  nameOfProfile?: (profileId: string) => string | undefined;
}

type Choice = 'default' | 'allowed' | 'not-allowed';
const CHOICES: { key: Choice; label: string }[] = [
  { key: 'default', label: 'Organisation default' },
  { key: 'allowed', label: 'Allowed' },
  { key: 'not-allowed', label: 'Not allowed' },
];
const toChoice = (value: boolean | null | undefined): Choice => (value === true ? 'allowed' : value === false ? 'not-allowed' : 'default');
const fromChoice = (choice: Choice): boolean | null => (choice === 'allowed' ? true : choice === 'not-allowed' ? false : null);

/**
 * Whether a minor's or dependant's membership carries a member's privileges, and why (`MEMBER-3`).
 * Shown only for one of them — younger than the org's minor age, or anyone with a guardian. The
 * org's switch comes first; then the person's own setting, which their guardians control, or an
 * Admin while there are none. A card on the read-first person page (docs/people.md); the Admin's
 * choice saves the moment it is picked, like a switch.
 */
export function MinorAccessCard({ player, settings, guardians, isOrgAdmin, nameOfProfile }: MinorAccessCardProps) {
  const isDark = useActiveTheme() === 'dark';
  const [isSaving, setIsSaving] = useState(false);
  const hasGuardian = guardians.length > 0;
  if (!isMinorIn(player.birthdate, settings, hasGuardian)) return null;
  const isMinor = isUnderAge(player.birthdate, settings.minorAge);

  const setBy = player.ownAccountSetBy
    ? guardians.find(g => g.guardianProfileId === player.ownAccountSetBy)?.guardianName || nameOfProfile?.(player.ownAccountSetBy)
    : undefined;
  const when = player.ownAccountSetAt ? ` on ${formatInstant(player.ownAccountSetAt)}` : '';
  const byWhom = setBy ? ` by ${setBy}${when}` : when;

  let status: string;
  let allowed: boolean;
  if (!settings.accountsAllowed) {
    allowed = false;
    status = isMinor
      ? `Not allowed: this organisation does not give players under ${settings.minorAge} member access.`
      : 'Not allowed: this organisation does not give minors or dependants member access.';
  } else if (player.ownAccountAllowed === false) {
    allowed = false;
    status = `Switched off${byWhom}.`;
  } else if (player.ownAccountAllowed === true) {
    allowed = true;
    status = `Allowed${byWhom}.`;
  } else {
    allowed = true;
    status = 'Allowed — the organisation’s default.';
  }

  const explanation = !settings.accountsAllowed
    ? `Switched off for every minor and dependant in Settings › Minors.${hasGuardian ? ' Once it is on, the guardian decides for this person.' : ''}`
    : hasGuardian
    ? 'Only a guardian can change this.'
    : isOrgAdmin
      ? 'No guardian is recorded, so an admin can set this. Once a guardian is added, only they can change it.'
      : 'No guardian is recorded. An admin can set this until one is.';

  const canSet = isOrgAdmin && !hasGuardian && settings.accountsAllowed;
  const choose = async (choice: Choice) => {
    const value = fromChoice(choice);
    if (value === (player.ownAccountAllowed ?? null)) return;
    setIsSaving(true);
    // The result arrives as the player's updated member row on `org:{id}:members`.
    await sendAction(SocketAction.SET_MINOR_ACCOUNT_ACCESS, { playerProfileId: player.id, allowed: value });
    setIsSaving(false);
  };

  return (
    <ReadCard
      label="Member access"
      help="Whether they get a member’s view of this organisation when they sign in. Without it they can still sign in and coach or score what they are appointed to."
    >
      <View className="flex-row items-start gap-3">
        <View className={`w-8 h-8 rounded-lg items-center justify-center ${allowed ? 'bg-success-soft' : 'bg-warning-soft'}`}>
          <Ionicons name={allowed ? 'lock-open-outline' : 'lock-closed-outline'} size={16} color={themeColor(isDark, allowed ? 'success-ink' : 'warning-ink')} />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="font-inter text-sm text-ink">{status}</Text>
          <Text className="font-inter text-xs text-ink-muted mt-0.5">{explanation}</Text>
        </View>
      </View>
      {canSet ? (
        <View style={{ opacity: isSaving ? 0.6 : 1 }} pointerEvents={isSaving ? 'none' : 'auto'}>
          <SegmentedControl options={CHOICES} value={toChoice(player.ownAccountAllowed)} onChange={choose} isCompact={false} />
        </View>
      ) : null}
    </ReadCard>
  );
}
