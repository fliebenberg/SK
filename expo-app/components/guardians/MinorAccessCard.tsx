import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OrgMinorsSettings, ProfileGuardian, RestrictedReason, SocketAction, isMinorIn } from '@sk/shared';
import { sendAction } from '../../services/actions';
import { formatInstant } from '../../utils/dates';
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

const CHOICES: { value: boolean | null; label: string }[] = [
  { value: null, label: 'Organisation default' },
  { value: true, label: 'Allowed' },
  { value: false, label: 'Not allowed' },
];

/**
 * Whether a minor's membership carries a member's privileges, and why (`MEMBER-3`). Shown only for a
 * minor — younger than the org's minor age, or anyone with a guardian. The org's switch comes first;
 * then the minor's own setting, which their guardians control, or an Admin while there are none.
 */
export function MinorAccessCard({ player, settings, guardians, isOrgAdmin, nameOfProfile }: MinorAccessCardProps) {
  const isDark = useActiveTheme() === 'dark';
  const [isSaving, setIsSaving] = useState(false);
  const hasGuardian = guardians.length > 0;
  if (!isMinorIn(player.birthdate, settings, hasGuardian)) return null;

  const setBy = player.ownAccountSetBy
    ? guardians.find(g => g.guardianProfileId === player.ownAccountSetBy)?.guardianName || nameOfProfile?.(player.ownAccountSetBy)
    : undefined;
  const when = player.ownAccountSetAt ? ` on ${formatInstant(player.ownAccountSetAt)}` : '';
  const byWhom = setBy ? ` by ${setBy}${when}` : when;

  let status: string;
  let allowed: boolean;
  if (!settings.accountsAllowed) {
    allowed = false;
    status = `Not allowed: this organisation does not give players under ${settings.minorAge} member access.`;
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

  const canSet = isOrgAdmin && !hasGuardian;
  const choose = async (value: boolean | null) => {
    if (value === (player.ownAccountAllowed ?? null)) return;
    setIsSaving(true);
    // The result arrives as the player's updated member row on `org:{id}:members`.
    await sendAction(SocketAction.SET_MINOR_ACCOUNT_ACCESS, { playerProfileId: player.id, allowed: value });
    setIsSaving(false);
  };

  return (
    <View className="flex-row items-start gap-3">
      <View className={`w-8 h-8 rounded-lg items-center justify-center ${allowed ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
        <Ionicons name={allowed ? 'lock-open-outline' : 'lock-closed-outline'} size={16} color={allowed ? '#10B981' : '#F59E0B'} />
      </View>
      <View className="flex-1">
        <Text className="font-inter-bold text-[10px] text-slate-400 uppercase tracking-wider">Member access for a minor</Text>
        <Text className="font-inter text-sm text-slate-800 dark:text-white mt-0.5">{status}</Text>
        <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {!settings.accountsAllowed
            ? `Switched off for every minor in Org Settings › Minors.${hasGuardian ? ' Once it is on, the guardian decides for this player.' : ''} A minor without member access can still sign in and coach or score what they are appointed to.`
            : hasGuardian
            ? 'Set by the guardian. A minor without member access can still sign in and coach or score what they are appointed to.'
            : isOrgAdmin
              ? 'No guardian is recorded, so an admin can set this. Once a guardian is added, only they can change it.'
              : 'No guardian is recorded. An admin can set this until one is.'}
        </Text>
        {canSet && settings.accountsAllowed ? (
          <View className="flex-row flex-wrap gap-2 mt-3">
            {CHOICES.map(choice => {
              const selected = (player.ownAccountAllowed ?? null) === choice.value;
              return (
                <TouchableOpacity
                  key={String(choice.value)}
                  onPress={() => choose(choice.value)}
                  disabled={isSaving}
                  style={{
                    borderWidth: 1,
                    borderColor: selected ? '#FF3E00' : (isDark ? 'rgba(255,255,255,0.1)' : '#CBD5E1'),
                    backgroundColor: selected ? '#FF3E00' : 'transparent',
                    opacity: isSaving ? 0.6 : 1,
                  }}
                  className="px-3 py-2 rounded-xl active:scale-95"
                >
                  <Text
                    style={{ color: selected ? '#fff' : (isDark ? '#94A3B8' : '#64748B') }}
                    className="font-orbitron-bold text-[9px] uppercase tracking-widest"
                  >
                    {choice.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}
