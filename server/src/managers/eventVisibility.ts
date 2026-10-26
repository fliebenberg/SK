/**
 * Who sees a tournament, by where each organisation's invitation stands (`FIX-29`, `FIX-30`).
 *
 * Three levels, because the statuses mean three different things:
 *
 * | Invitation | Public lists | Its members (the workspace) | Rosters and members' rooms |
 * |---|---|---|---|
 * | not invited yet | no | no | no |
 * | invited | no | yes, to answer it | yes |
 * | accepted, withdrawal pending | yes | yes | yes |
 * | declined, withdrawn | no | yes, marked so | no |
 *
 * - **Public lists** are an organisation's own events and fixtures — `org:{id}:events` and
 *   `org:{id}:fixtures`, both public rooms — and the counts on its summary. A tournament shows there
 *   only once the organisation is in it.
 * - **Its members** see the rest in the workspace through `org:{id}:invitations`, a members' room:
 *   an invitation to answer, and one they declined or withdrew from, which stays as the record.
 * - **Rosters and members' rooms** (`AccessManager.getGameOrgIds`, `getDivisionOrgIds`,
 *   `getEventOrgIds`): an invited organisation may read what it is being asked to join; one that
 *   declined or withdrew keeps only the public view (agreed 2026-10-07).
 *
 * An organisation with no row at all — a friendly, `FIX-5` — keeps the old routes in. A new query
 * that answers "can this organisation see this event" belongs here, not inline.
 */

/** Statuses whose tournaments an organisation's public lists show. */
/**
 * Whether an event may be shown to the public on Home (`HOME-1`) — **a stand-in that passes every
 * event** until the organisers can make a tournament public (`FIX-38`). Replace the body with the
 * real check then; every public list that should honour it already calls this.
 */
export const PUBLIC_EVENT = (_eventAlias: string) => `TRUE`;

export const LISTED =`('accepted', 'withdrawal_pending')`;

/** Statuses whose members may read the tournament's rosters and members' rooms. */
export const MEMBER_ACCESS = `('invited', 'accepted', 'withdrawal_pending')`;

/** Statuses its members see in the workspace's invitations list rather than its events. */
export const INVITATION_LIST = `('invited', 'declined', 'withdrawn')`;

/**
 * SQL: organisation `org` has a row in event `event` that keeps it out of its public lists. Each
 * "which events does this organisation list" query is `NOT` this, `AND` its usual routes in.
 */
export const NOT_LISTED = (event: string, org: string) =>
  `EXISTS (SELECT 1 FROM event_organizations nx WHERE nx.event_id = ${event} AND nx.org_id = ${org} AND nx.invitation NOT IN ${LISTED})`;

/**
 * SQL: the public may see organisation `org`'s teams in event `event` (`FIX-25`): the host's, and
 * those of an organisation that accepted — or withdrew after the fixtures were made, so its games are
 * not left as unexplained gaps. One only invited, or that declined, is not public business.
 */
export const PUBLIC_TEAMS = (event: string, org: string, host: string) =>
  `(${org} = ${host} OR NOT EXISTS (SELECT 1 FROM event_organizations px WHERE px.event_id = ${event} AND px.org_id = ${org} AND px.invitation NOT IN ('accepted', 'withdrawal_pending', 'withdrawn')))`;

/** SQL: organisation `org` has a row in event `event` that gives its members no access. */
export const NO_MEMBER_ACCESS = (event: string, org: string) =>
  `EXISTS (SELECT 1 FROM event_organizations nx WHERE nx.event_id = ${event} AND nx.org_id = ${org} AND nx.invitation NOT IN ${MEMBER_ACCESS})`;
