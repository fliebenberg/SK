import React from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { MatchPermissions } from '../utils/matchPermissions';
import { SegmentedControl, SegmentedControlOption } from './SegmentedControl';

export type MatchViewType = 'view' | 'selection' | 'edit' | 'score';

interface MatchViewSwitcherProps {
  orgId: string;
  eventId: string;
  gameId: string;
  currentView: MatchViewType;
  permissions: MatchPermissions;
  onNavigate?: (targetView: MatchViewType) => void;
}

export const MatchViewSwitcher: React.FC<MatchViewSwitcherProps> = ({
  orgId,
  eventId,
  gameId,
  currentView,
  permissions,
  onNavigate,
}) => {
  const router = useRouter();

  const handlePress = (targetView: MatchViewType) => {
    if (targetView === currentView) return;
    if (onNavigate) {
      onNavigate(targetView);
    } else {
      router.push(`/admin/${orgId}/events/${eventId}/games/${gameId}/${targetView}`);
    }
  };

  const actions: Array<{
    key: MatchViewType;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    iconActive: keyof typeof Ionicons.glyphMap;
    allowed: boolean;
  }> = [
    {
      key: 'view',
      label: 'View',
      icon: 'eye-outline',
      iconActive: 'eye',
      allowed: permissions.canView,
    },
    {
      key: 'selection',
      label: 'Lineup',
      icon: 'people-outline',
      iconActive: 'people',
      allowed: permissions.canSelectLineup,
    },
    {
      key: 'edit',
      label: 'Edit',
      icon: 'pencil-outline',
      iconActive: 'pencil',
      allowed: permissions.canEdit,
    },
    {
      key: 'score',
      label: 'Score',
      icon: 'trophy-outline',
      iconActive: 'trophy',
      allowed: permissions.canScore,
    },
  ];

  const options: Array<SegmentedControlOption<MatchViewType>> = actions
    .filter((a) => a.allowed)
    .map((a) => ({
      key: a.key,
      label: a.label,
      icon: a.icon,
      iconActive: a.iconActive,
    }));

  return (
    <SegmentedControl<MatchViewType>
      options={options}
      value={currentView}
      onChange={handlePress}
    />
  );
};
