import React from 'react';
import { Stack } from 'expo-router';
import { PublicTournamentProvider } from '../../../components/tournament/tournamentLinks';

/**
 * A tournament as the public sees it (`FIX-25`, docs/events.md §11): outside every workspace, in the
 * public tab bar, read-only whoever is looking, with no account needed. The pages are the
 * workspace's own, under {@link PublicTournamentProvider} — which keeps their links on this side and
 * leaves out what only those taking part see.
 */
export default function PublicEventLayout() {
  return (
    <PublicTournamentProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </PublicTournamentProvider>
  );
}
