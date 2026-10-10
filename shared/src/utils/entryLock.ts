import { EventOrgBadge } from "../models/event/Event";
import { TournamentEntrant, isEntrantInPlay } from "../models/event/Tournament";

/**
 * What still stands between a division and the lock (`FIX-31`) — the client's mirror of the server's
 * `TournamentManager.entryLockProblem`, so a page can say what is left before anyone presses Lock.
 *
 * - `invited` — teams still to answer. Some of them may belong to an organisation not invited yet
 *   (`notInvited`), which no answer can come from until it is.
 * - `requested` — teams an organisation added, or asked to enter late, waiting for the organisers.
 * - `orgNotIn` — teams in play whose organisation has not accepted the invitation.
 */
export interface EntryLockGaps {
  invited: TournamentEntrant[];
  notInvited: TournamentEntrant[];
  requested: TournamentEntrant[];
  orgNotIn: TournamentEntrant[];
  total: number;
}

export function entryLockGaps(
  entrants: TournamentEntrant[],
  event: { orgId?: string; participatingOrgs?: Pick<EventOrgBadge, 'id' | 'invitation'>[] }
): EntryLockGaps {
  const invitationOf = (orgId?: string) =>
    !orgId || orgId === event.orgId ? 'accepted' : event.participatingOrgs?.find(o => o.id === orgId)?.invitation ?? 'accepted';
  const invited = entrants.filter(e => e.status === 'invited');
  const notInvited = invited.filter(e => invitationOf(e.orgId) === 'not_invited');
  const requested = entrants.filter(e => e.status === 'requested');
  const orgNotIn = entrants.filter(e => {
    const invitation = invitationOf(e.orgId);
    return isEntrantInPlay(e.status) && invitation !== 'accepted' && invitation !== 'withdrawal_pending';
  });
  return { invited, notInvited, requested, orgNotIn, total: invited.length + requested.length + orgNotIn.length };
}
