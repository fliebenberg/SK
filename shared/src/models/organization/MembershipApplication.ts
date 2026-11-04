import type { CalendarDate } from '../../utils/calendarDate';
import type { GuardianRelationship } from '../people/ProfileGuardian';

export type MembershipApplicationStatus = 'pending' | 'approved' | 'declined' | 'withdrawn';

/** Someone on the organisation's records this application might be: the decider says (`MEMBER-1`). */
export interface ApplicationPossibleMatch {
  id: string;
  name: string;
  birthdate?: CalendarDate;
  personOrgId?: string;
  /** Their number is the one on the application: a hint, never proof, as nothing verifies it (`MEMBER-7`). */
  sameCellphone?: boolean;
}

/**
 * Asking to join an organisation (`MEMBER-1`). Joins nobody until it is approved. Its birthdate and
 * contact details go to the organisation's admins and staff, and to the applicant, alone.
 */
export interface MembershipApplication {
  id: string;
  orgId: string;
  applicantUserId: string;
  applicantName: string;
  applicantEmail: string;
  applicantCellphone: string;
  /** The person joining: the applicant, or their child when `relationship` is set. */
  name: string;
  birthdate: CalendarDate;
  relationship?: GuardianRelationship | null;
  note?: string | null;
  status: MembershipApplicationStatus;
  orgProfileId?: string | null;
  createdAt: string;
  decidedAt?: string | null;
  /** On the queue only. */
  possibleMatches?: ApplicationPossibleMatch[];
  /** On the queue, for a child's application: who the parent applying might already be (`MEMBER-7`). */
  possibleGuardianMatches?: ApplicationPossibleMatch[];
  /** On the applicant's own, once declined. */
  reapplyFrom?: CalendarDate;
}
