import React from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { MatchPermissions } from '../utils/matchPermissions';
import { SegmentedControl, SegmentedControlOption } from './SegmentedControl';

interface MatchViewSwitcherProps {
  orgId: string;
  eventId: string;
  gameId: string;
  currentView: 'view' | 'edit' | 'score';
  permissions: MatchPermissions;
  onNavigate?: (targetView: 'view' | 'edit' | 'score') => void;
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

  const handlePress = (targetView: 'view' | 'edit' | 'score') => {
    if (targetView === currentView) return;
    if (onNavigate) {
      onNavigate(targetView);
    } else {
      router.push(`/admin/${orgId}/events/${eventId}/games/${gameId}/${targetView}`);
    }
  };

  const actions: Array<{
    key: 'view' | 'edit' | 'score';
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

  const options: Array<SegmentedControlOption<'view' | 'edit' | 'score'>> = actions
    .filter((a) => a.allowed)
    .map((a) => ({
      key: a.key,
      label: a.label,
      icon: a.icon,
      iconActive: a.iconActive,
    }));

  return (
    <SegmentedControl<'view' | 'edit' | 'score'>
      options={options}
      value={currentView}
      onChange={handlePress}
    />
  );
};
