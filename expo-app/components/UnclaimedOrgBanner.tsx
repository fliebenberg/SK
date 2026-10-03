import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NominateAdminModal } from './NominateAdminModal';
import { useOrgClaimStatus } from '../hooks/useOrgClaimStatus';
import { useActiveTheme } from '../store/settingsStore';
import { themeColor } from '../constants/Colors';


/**
 * One line across the top of an organisation's admin workspace while it has no administrator —
 * the workspace's way into `NominateAdminModal` (docs/nomination-process.md §4). The layout shows
 * it on every workspace page.
 *
 * The same message for members and outsiders: the org has no admin, please nominate one. Whether
 * the viewer may take the role themselves is the dialog's to offer. It cannot be dismissed, and is
 * kept to one line so it costs little; it goes when the org is claimed (`isClaimed` arrives with the
 * org summary). Amber until the viewer has nominated someone, then green — someone else's
 * nomination does not count, as on the chip badge.
 */
export function UnclaimedOrgBanner({ org }: { org: { id: string; name: string; isClaimed?: boolean } | null }) {
  const isDark = useActiveTheme() === 'dark';
  const unclaimed = !!org && org.isClaimed === false;
  const { status, addPending, refresh } = useOrgClaimStatus(org?.id, unclaimed);
  const [isOpen, setIsOpen] = useState(false);

  if (!org) return null;
  const showBanner = unclaimed && !status?.isClaimed;
  // The dialog outlives the banner: taking the role claims the org while its "done" view is showing.
  if (!showBanner && !isOpen) return null;

  const mine = status?.myPendingEmails || [];
  const pending = mine.length > 0;
  const accent = pending ? themeColor(isDark, 'success-ink') : themeColor(isDark, 'warning-ink');

  return (
    <>
      {showBanner && (
        <SafeAreaView
          edges={['top']}
          className={pending
            ? 'bg-success-soft border-b border-success-line'
            : 'bg-warning-soft border-b border-warning-line'}
        >
          <View className="flex-row items-center gap-2 px-4 py-1.5">
            <Ionicons name={pending ? 'mail-outline' : 'alert-circle-outline'} size={15} color={accent} />
            <Text
              numberOfLines={1}
              className={`flex-1 font-inter text-xs ${pending ? 'text-success-ink' : 'text-warning-ink'}`}
            >
              {pending
                ? `${org.name} has no administrator yet. You invited ${mine.join(', ')}.`
                : `${org.name} has no administrator yet. Please nominate someone to run it.`}
            </Text>
            <TouchableOpacity
              onPress={() => setIsOpen(true)}
              accessibilityRole="button"
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              className="active:opacity-60"
            >
              <Text
                className={`font-inter-bold text-xs ${pending ? 'text-success-ink' : 'text-warning-ink'}`}
              >
                {pending ? 'Invite another' : 'Nominate'}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      )}

      <NominateAdminModal
        visible={isOpen}
        onClose={() => setIsOpen(false)}
        org={org}
        status={status}
        onNominated={addPending}
        onTookOver={refresh}
      />
    </>
  );
}
