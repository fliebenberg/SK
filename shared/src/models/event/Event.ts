/**
 * What kind of thing an event is.
 *
 * `'SportsDay'` is gone, in both halves. The database has refused it since the tournaments
 * migration — `events.type` carries `CHECK (type IN ('SingleMatch', 'Tournament'))` (D1: a sports
 * day is a `Tournament` whose `format` is `'Festival'`) — and Phase 5 removed the last four client
 * call sites that branched on it. Code that meets a type it does not recognise now renders an
 * error state rather than assuming `Tournament` (U39 / `FIX-1`); see
 * `expo-app/utils/eventType.ts`.
 */
export type EventType = 'SingleMatch' | 'Tournament';

import type { ScoringSystem } from './Tournament';
import type { OrgBadge } from '../organization/Organization';
import type { CalendarDate } from '../../utils/calendarDate';

/**
 * How a tournament is structured — what the event screen keys its tabs and setup steps off.
 * Null on a `SingleMatch`, which has no structure to describe.
 */
export type EventFormat = 'Festival' | 'RoundRobin' | 'Knockout' | 'PoolsKnockout';

/**
 * The formats an organiser picks from, in the order the picker offers them.
 *
 * The label *is* the stored value (U34): once somebody is choosing from a list of formats, every
 * entry should name a structure, and "Sports Day" named an occasion — it read oddly beside "Round
 * Robin" and "Knockout", and it told the organiser nothing about what they were choosing.
 */
export const EVENT_FORMATS: Array<{ value: EventFormat; label: string; description: string }> = [
  {
    value: 'Festival',
    label: 'Festival',
    description: 'Fixtures arranged by hand, with no table decided in advance. A school sports day.',
  },
  {
    value: 'RoundRobin',
    label: 'Round Robin',
    description: 'Everybody plays everybody, ranked on a points table.',
  },
  {
    value: 'Knockout',
    label: 'Knockout',
    description: 'A single-elimination draw. Losing ends your tournament.',
  },
  {
    value: 'PoolsKnockout',
    label: 'Pools & Knockout',
    description: 'Pool rounds first, then the qualifiers meet in a knockout.',
  },
];

/** The organiser-facing name of a format, for anywhere a label is rendered from a stored value. */
export function eventFormatLabel(format?: EventFormat | null): string {
  return EVENT_FORMATS.find(f => f.value === format)?.label || 'Festival';
}

/**
 * Where an organisation taking part in an event stands with its invitation (`FIX-29`).
 *
 * An organisation is **added** first — the organiser can enter its teams — and cannot see the event
 * until it is **invited**. It then answers, or the organiser records the answer they got another
 * way; an answer is final for the organisation, and only the organisers change it (`FIX-30`).
 * Declining takes its teams out. An organisation that accepted can **ask to withdraw**, with a
 * reason (`withdrawal_pending`, which changes nothing yet); the organisers confirm it
 * (`withdrawn`, treated as declined) or keep it in (back to `accepted`). Rows from before the
 * status existed, and the host's own, are `accepted`. Who sees what at each status is
 * `server/src/managers/eventVisibility.ts`.
 */
export type EventOrgInvitation = 'not_invited' | 'invited' | 'accepted' | 'declined' | 'withdrawal_pending' | 'withdrawn';

export const EVENT_ORG_INVITATIONS: readonly EventOrgInvitation[] = ['not_invited', 'invited', 'accepted', 'declined', 'withdrawal_pending', 'withdrawn'];

/** Taking part: accepted, including one asking to withdraw — its teams stay until confirmed. */
export const isTakingPart = (invitation: EventOrgInvitation) => invitation === 'accepted' || invitation === 'withdrawal_pending';

/** Out of it, but kept as the record that it was invited: it declined, or withdrew. */
export const hasLeft = (invitation: EventOrgInvitation) => invitation === 'declined' || invitation === 'withdrawn';

/** An organisation taking part in an event, with its invitation. */
export interface EventOrgBadge extends OrgBadge {
  invitation: EventOrgInvitation;
  /** When it was invited — an instant. `null` while it is not invited yet. */
  invitedAt?: string | null;
  /** When it accepted or declined — an instant. `null` while there is no answer. */
  answeredAt?: string | null;
}

/** A person who did something to an invitation, and the organisation they acted from. */
export interface EventOrgActorName {
  userId: string;
  name: string;
  orgName: string | null;
}

/**
 * Who invited an organisation and who gave its answer (`FIX-26`). Names, so it is read by
 * `get_data` `event_org_history` rather than travelling on the event, which goes to a public room.
 */
export interface EventOrgHistory {
  invitedBy: EventOrgActorName | null;
  answeredBy: EventOrgActorName | null;
  /** An accepted organisation asking to withdraw — and, once withdrawn, the record of it. */
  withdrawal: { reason: string | null; requestedAt: string | null; requestedBy: EventOrgActorName | null } | null;
}


export interface Event {
  id: string;
  name: string;
  /**
   * Required in the database (`NOT NULL` with a `CHECK`) and required in practice, but left
   * optional here because payloads on the way *in* build an event field by field. A row that comes
   * back without one is a bug, not a legacy shape — render the error state rather than defaulting.
   */
  type?: EventType;
  /** Set on a `Tournament`, absent on a `SingleMatch`. */
  format?: EventFormat;
  date?: string; // Legacy field
  /** The day it starts — a calendar date, never a timestamp (date-formatting skill). */
  startDate: CalendarDate;
  /** The last day, for an event over several. `null` on an update clears it. */
  endDate?: CalendarDate | null;
  /** `null` on an update clears it. */
  siteId?: string | null;
  /** `null` on an update clears it. */
  facilityId?: string | null;
  orgId: string;
  /**
   * The organisations that can **see** the event: every one taking part except those **not invited
   * yet** (`FIX-29`, 2026-10-05). Whoever is told about the event — its org rooms, the events lists —
   * is told through this list, so an organisation added but not invited hears nothing. The whole
   * list taking part, with each one's invitation, is `participatingOrgs`.
   */
  participatingOrgIds?: string[];
  /**
   * The same organisations, named — so a screen can print them without looking anything up.
   *
   * `FIX-2` is what this closes. The event screen used to read *every* organisation in the system
   * to resolve a handful of names, kept the answer only `if (Array.isArray(res))` — which a
   * paginated response never satisfies — and so silently rendered no names at all. Displaying the
   * orgs already involved in an event is data a room owns, exactly as `FIX-7` established for a
   * fixture's team and org names, so it travels with the event and cannot go stale while a screen
   * is open. Choosing which orgs to *invite* is a different question, over a set no room owns, and
   * stays a search.
   */
  participatingOrgs?: EventOrgBadge[];
  sportIds?: string[];
  settings?: {
    /**
     * The tournament's points system (D17), which every division inherits unless it carries its
     * own. `TournamentManager.resolveScoringConfig` reads exactly this key, falling back to
     * `DEFAULT_SCORING_SYSTEM`; the Scoring step of the setup checklist writes it.
     */
    scoring?: ScoringSystem;
    pointSystem?: 'standard' | 'weighted';
    pointsPerWin?: number;
    pointsPerDraw?: number;
    levelWeighting?: Record<string, number>;
    positions?: { id: string; name: string }[];
    /**
     * Setup checklist steps the organiser has dismissed (U17).
     *
     * On the event rather than on the viewer: a step that does not apply — a festival with no
     * points system — does not apply for *anybody* organising it, and the alternative nags every
     * co-organiser separately. Dismissing is not completing; a dismissed step is hidden, and the
     * checklist says how many were.
     */
    dismissedSetupSteps?: string[];
  };
  status?: 'Scheduled' | 'Cancelled' | 'Finished';
}
