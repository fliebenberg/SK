import React from 'react';
import TeamPage from '../../admin/[orgId]/teams/[teamId]';
import { PublicTournamentProvider } from '../../../components/tournament/tournamentLinks';

/**
 * A team as the public sees it (2026-10-22, docs/teams.md §6): the workspace's page, read-only under
 * the public provider, in the public tab bar with Teams marked.
 */
export default function PublicTeamPage() {
  return <PublicTournamentProvider><TeamPage /></PublicTournamentProvider>;
}
