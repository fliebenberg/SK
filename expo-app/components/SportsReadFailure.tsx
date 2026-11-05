import React from 'react';
import { View } from 'react-native';
import { ReadFailure } from './ReadFailure';
import { readSports, useSportsStore } from '../hooks/useEventRooms';

/**
 * The sports did not load, and nothing is held (`SYNC-9`). More than a dozen screens name sports from
 * this list, and the schedule's checks take game lengths from it, so without it they can read as "no
 * problems" with nothing wrong on the screen itself. It is said once, here, under the offline banner,
 * rather than on each of them.
 */
export function SportsReadFailure() {
  const error = useSportsStore(state => state.error);
  const held = useSportsStore(state => state.sports.length > 0);
  if (!error || held) return null;
  return (
    <View className="bg-canvas px-3 py-2">
      <ReadFailure
        title="Sport details did not load."
        reason={`${error} Until they do, sport names may be missing and schedule checks cannot be relied on.`}
        onRetry={() => { void readSports(); }}
      />
    </View>
  );
}
