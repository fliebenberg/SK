import React from 'react';
import SitePage from '../../admin/[orgId]/sites/[siteId]';
import { PublicTournamentProvider } from '../../../components/tournament/tournamentLinks';

/**
 * A site as the public sees it (2026-10-22, docs/sites.md): the workspace's page, read-only under
 * the public provider, in the public tab bar with Sites marked.
 */
export default function PublicSitePage() {
  return <PublicTournamentProvider><SitePage /></PublicTournamentProvider>;
}
