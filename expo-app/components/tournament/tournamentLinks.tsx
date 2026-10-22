import React, { createContext, useContext } from 'react';

/**
 * Where a tournament's pages link to: the workspace's, or the public's (`FIX-25`, docs/events.md §11).
 *
 * The same pages serve both. Under `/admin/[orgId]/events/[eventId]` they are an organisation's
 * workspace; under `/events/[eventId]` (the public tab bar, no workspace) they are the read-only page
 * anyone sees — the public routes wrap them in {@link PublicTournamentProvider}. So a page, and every
 * card on it, builds its links here rather than writing `/admin/...`, and a link always stays on the
 * side it started from.
 *
 * `isPublic` is also how a page leaves out what only those taking part see — a response card, To do,
 * *Mine / My organisation / All*, players' names — whoever the viewer is: a member of an organisation
 * taking part who opens the public link sees what the public sees, and their workspace has the rest.
 */
const PublicTournamentContext = createContext(false);

export function PublicTournamentProvider({ children }: { children: React.ReactNode }) {
  return <PublicTournamentContext.Provider value>{children}</PublicTournamentContext.Provider>;
}

export function useIsPublicTournament(): boolean {
  return useContext(PublicTournamentContext);
}

/** A tournament's own address, and the pages under it, on the side this page is on. */
export function useTournamentLinks(orgId: string | undefined) {
  const isPublic = useIsPublicTournament();
  return {
    isPublic,
    /** `rest` starts with `/` or `?`, or is empty for the tournament page itself. */
    event: (eventId: string, rest = '') => (isPublic ? `/events/${eventId}${rest}` : `/admin/${orgId}/events/${eventId}${rest}`) as any,
    /** Where a tournament page goes back to when there is no history: the events list, or the organisations. */
    home: () => (isPublic ? '/organizations' : `/admin/${orgId}/events`) as any,
  };
}
