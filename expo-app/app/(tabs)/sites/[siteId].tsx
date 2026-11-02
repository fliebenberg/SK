import React, { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import SitePage from '../../admin/[orgId]/sites/[siteId]';
import { PublicTournamentProvider } from '../../../components/tournament/tournamentLinks';

/**
 * A site as the public sees it (2026-10-22, docs/sites.md): the workspace's page, read-only under
 * the public provider, in the public tab bar with Organisations marked.
 *
 * There is no list of all sites (`UI-38`), and an `index` route must not come back to catch the old
 * `/sites` address: the stack would keep it under this page, and Back would go there instead of to
 * where the viewer came from. So the router sends `/sites` here with no real id, and it goes on to
 * the Organisations page, where each organisation lists its sites.
 */
export default function PublicSitePage() {
  const router = useRouter();
  const { siteId } = useLocalSearchParams<{ siteId: string }>();
  const hasSite = !!siteId && siteId !== 'undefined';

  useEffect(() => {
    if (!hasSite) router.replace('/organizations');
  }, [hasSite, router]);

  if (!hasSite) return null;
  return <PublicTournamentProvider><SitePage /></PublicTournamentProvider>;
}
