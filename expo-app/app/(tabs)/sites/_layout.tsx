import React from 'react';
import { Stack } from 'expo-router';

/**
 * One site page at a time. This stack stays behind when the viewer goes back to another tab, so
 * without `dangerouslySingular` the next site would open on top of the last, and Back from it would
 * show the old site instead of the page the viewer came from.
 */
export default function SitesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[siteId]" dangerouslySingular={() => 'site'} />
    </Stack>
  );
}
