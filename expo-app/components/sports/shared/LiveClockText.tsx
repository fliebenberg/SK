import React, { memo, useState, useEffect } from 'react';
import { Text } from 'react-native';
import { GameClockState } from '@sk/shared';
import { useGameTimer } from '../../../hooks/useGameTimer';
import { COLORS } from '../../../constants/Colors';

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
  const { formattedTime, currentMS } = useGameTimer(clock, startTime, finishTime, showHours);
  const [isBlinking, setIsBlinking] = useState(false);

  const periodIndex = clock?.periodIndex ?? 0;
  const periodLengthMS = clock?.periodLengthMS || 40 * 60 * 1000;
  const isPeriodActive = clock?.isPeriodActive ?? false;
  const currentPeriodElapsedMS = Math.max(0, currentMS - (periodIndex * periodLengthMS));
  const hasPeriodElapsed = isPeriodActive && periodLengthMS > 0 ? currentPeriodElapsedMS >= periodLengthMS : false;

  useEffect(() => {
    if (!hasPeriodElapsed) {
      setIsBlinking(false);
      return;
    }

    const interval = setInterval(() => {
      setIsBlinking(prev => !prev);
    }, 500);

    return () => clearInterval(interval);
  }, [hasPeriodElapsed]);

  if (hasPeriodElapsed) {
    return (
      <Text
        className={className}
        style={{
          color: COLORS.brand.red,
          opacity: isBlinking ? 1 : 0.25,
        }}
      >
        {formattedTime}
      </Text>
    );
  }

  return <Text className={className}>{formattedTime}</Text>;
});

