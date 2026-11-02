import React from 'react';
import { Stack } from 'expo-router';

/**
 * The public team page, as a hidden tab of its own at the same `/teams/[teamId]` address (`UI-43`).
 * In the Teams tab's stack the Teams list would sit under it, and Back would go there even for a team
 * opened from an organisation. One page at a time: this stack stays behind when the viewer goes back
 * to another tab, so the next team would otherwise open on top of the last, and Back would show it.
 */
export default function TeamPageLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="teams/[teamId]" dangerouslySingular={() => 'team'} />
    </Stack>
  );
}
