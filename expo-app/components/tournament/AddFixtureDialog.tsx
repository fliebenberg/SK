import React from 'react';
import { Event, isDualEvent, timeOfDay } from '@sk/shared';
import { AddFixtureSheet, type FixtureSlot } from './AddFixtureSheet';
import { useScheduleCheck } from './useScheduleCheck';
import { useEventDivisions, useEventFacilityIds, useEventFixtures, useSports } from '../../hooks/useEventRooms';
import { useOrgSites } from '../../hooks/useOrgSites';
import { useOrgSummary } from '../../hooks/useOrgSummary';
import { useToastStore } from '../../store/toastStore';
import { formatPlayingDay } from '../../utils/dates';

/**
 * The Schedule's *Add a fixture* sheet, opened from outside the Schedule — the division page's
 * *＋ Add a fixture* and the tournament page's *＋ Add a fixture by hand* (`FIX-36`, 2026-10-17).
 * The Schedule is the primary place to add fixtures (design rule 32); this is the secondary way in
 * the user asked to keep, and it is the same sheet: the sides are the division's entrants in play,
 * and the time and court are placed with the Schedule's clash check. Mounted only while open, since
 * it reads the tournament's fixtures.
 */
export function AddFixtureDialog({ event, orgId, divisionId, onClose }: {
  event: Event;
  orgId: string;
  /** Add to this division; none — any of the tournament's, the first chosen. */
  divisionId?: string;
  onClose: () => void;
}) {
  const games = useEventFixtures(event.id);
  const allDivisions = useEventDivisions(event.id);
  const facilityIds = useEventFacilityIds(event.id);
  const { sites, facilities } = useOrgSites(event.orgId);
  const { org: hostOrg } = useOrgSummary(event.orgId);
  const sports = useSports();
  const check = useScheduleCheck({ event, orgId, canEdit: true, divisions: allDivisions, games, sports, sites, facilities, facilityIds, hostOrg });
  // A Head to Head's games are made by pairing, never added here.
  const divisions = isDualEvent(event) ? [] : divisionId ? allDivisions.filter(d => d.id === divisionId) : allDivisions;
  const days = (event.days || []).map(d => d.day);
  if (!divisions.length) return null;

  const added = (g: { id: string; name: string }, placed: FixtureSlot | null) => {
    onClose();
    useToastStore.getState().showSuccess(
      placed
        ? `${g.name} — ${check.facilityOf(placed.facilityId)?.name}, ${formatPlayingDay(placed.day)} ${timeOfDay(placed.start)}.`
        : `${g.name} is under Without a time on the Schedule, to place later.`,
      'Fixture added',
    );
  };

  return (
    <AddFixtureSheet
      event={event}
      orgId={orgId}
      divisions={divisions}
      divisionName={check.divisionName}
      initialDivisionId={divisionId}
      days={(days.length ? days : [...new Set(check.model.bookings.map(b => b.day))].sort()) as any}
      facilityIds={facilityIds}
      divisionFacilityIds={check.divisionFacilityIds}
      facilityLabel={check.facilityLabel}
      model={check.model}
      timeZone={check.timeZone}
      wouldClash={check.wouldClash}
      onClose={onClose}
      onAdded={added}
    />
  );
}
