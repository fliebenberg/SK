import React, { memo } from 'react';
import { Text } from 'react-native';
import { GameClockState } from '@sk/types';
import { useGameTimer } from '../../../hooks/useGameTimer';

interface LiveClockTextProps {
  clock?: GameClockState;
  startTime?: string;
  finishTime?: string;
  showHours?: boolean;
  className?: string;
}

export const LiveClockText = memo(function LiveClockText({
  clock,
  startTime,
  finishTime,
  showHours = true,
  className = 'font-orbitron-bold text-sm text-amber-500',
}: LiveClockTextProps) {
  const { formattedTime } = useGameTimer(clock, startTime, finishTime, showHours);

  return <Text className={className}>{formattedTime}</Text>;
});
