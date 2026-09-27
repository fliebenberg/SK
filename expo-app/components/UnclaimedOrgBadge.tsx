import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NominateAdminModal } from './NominateAdminModal';
import { useOrgClaimStatus } from '../hooks/useOrgClaimStatus';
import { useActiveTheme } from '../store/settingsStore';
import { COLORS, getThemeColor } from '../constants/Colors';

/**
 * The small icon on an organisation chip that asks the user to help an organisation with no
 * administrator get one — the chip's way into `NominateAdminModal` (docs/nomination-process.md §4).
 *
 * For forms where the user picks *someone else's* organisation: the match form's two sides, the
 * add-game screen's opponent, the tournament's entrants. Self-contained so any of them can drop it
 * in: it reads the org's claim status itself, and the invitation is sent the moment the email is
 * submitted rather than when the surrounding form saves — the nomination is not part of whatever
 * process the org is being added to. Yellow means "you have not nominated anyone for this org";
 * green means you have, so an organiser setting up several events in a day is not asked about the
 * same school each time. Someone else's nomination does not count: the org stays yellow for you
 * until you name a contact yourself.
 *
 * Renders nothing for a claimed org. The hover hint is positioned above the icon, so a container
 * that stacks chips should raise the hovered chip via `onHoverChange`.
 */
export interface UnclaimedOrgBadgeProps {
  org: { id: string; name: string; isClaimed?: boolean };
  size?: number;
  className?: string;
  onHoverChange?: (hovered: boolean) => void;
  /**
   * Open the dialog as soon as the status comes back yellow — for a chip the user has just added,
   * so the appeal is made without relying on them noticing the icon. Once per org; they can
   * cancel. Leave off for chips that were already there when the screen opened.
   */
  autoPrompt?: boolean;
}

export function UnclaimedOrgBadge({ org, size = 14, className = '', onHoverChange, autoPrompt = false }: UnclaimedOrgBadgeProps) {
  const isDark = useActiveTheme() === 'dark';
  const unclaimed = org.isClaimed === false;
  const { status, addPending, refresh } = useOrgClaimStatus(org.id, unclaimed);
  const [hovered, setHovered] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const promptedForOrg = useRef<string | null>(null);

  useEffect(() => {
    if (!autoPrompt || !status || status.isClaimed || status.myPendingEmails.length > 0) return;
    if (promptedForOrg.current === org.id) return;
    promptedForOrg.current = org.id;
    setIsOpen(true);
  }, [autoPrompt, status, org.id]);

  // The dialog outlives the icon: taking the role claims the org while its "done" view is showing.
  const showIcon = unclaimed && !status?.isClaimed;
  if (!showIcon && !isOpen) return null;

  const mine = status?.myPendingEmails || [];
  const pending = mine.length > 0;
  const hint = pending
    ? `You invited ${mine.join(', ')} to claim this organisation. Click to invite someone else.`
    : `${org.name} has no administrator yet. Click to nominate one.`;
  // Light-mode swaps (`UI-6`): brand green is 1.67:1 on white and brand yellow worse; the icon is
  // the whole signal, so it takes the success token and amber-700.
  const iconColor = pending ? getThemeColor(isDark, 'success') : isDark ? COLORS.brand.yellow : '#B45309';

  const setHover = (h: boolean) => {
    setHovered(h);
    onHoverChange?.(h);
  };

  return (
    <>
      {showIcon && <Pressable
        onPress={() => setIsOpen(true)}
        onHoverIn={() => setHover(true)}
        onHoverOut={() => setHover(false)}
        accessibilityRole="button"
        accessibilityLabel={hint}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        className={className}
        style={{ zIndex: hovered ? 30 : undefined }}
      >
        <Ionicons name={pending ? 'mail' : 'alert-circle'} size={size} color={iconColor} />
        {hovered && (
          <View
            className="absolute bg-slate-900 dark:bg-slate-700 rounded-lg px-2.5 py-1.5 shadow-lg"
            style={{ bottom: size + 10, left: -100, width: 220 }}
            pointerEvents="none"
          >
            <Text className="font-inter text-[11px] text-white text-center">{hint}</Text>
          </View>
        )}
      </Pressable>}

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
