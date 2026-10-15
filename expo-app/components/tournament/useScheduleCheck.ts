import { ComponentProps, useCallback, useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Booking, Clash, Event, Facility, GameSummary, ScheduleContext, Site, SocketAction, Sport, TournamentDivision,
  divisionFullName, findClashes, sharedGroundMap, timeOfDay,
} from '@sk/shared';
import { scheduleModel } from './scheduleModel';
import { sendAction } from '../../services/actions';
import { venueTimeZone } from '../../utils/dates';

/**
 * A tournament's clash check, and the words for it — the Schedule tab's, lifted out so the game page
 * moves a fixture with exactly the same check and the same sentences (stage 3, 2026-10-15).
 *
 * The bookings are the tournament's own fixtures (`scheduleModel`) and the venue's other events'
 * (`GET_SCHEDULE_CONTEXT`, read on opening and after each move by whoever may move fixtures).
 */
export function useScheduleCheck({ event, orgId, canEdit, divisions, games, sports, sites, facilities, facilityIds, hostOrg }: {
  event: Event;
  orgId: string;
  canEdit: boolean;
  divisions: TournamentDivision[];
  games: GameSummary[];
  sports: Sport[];
  sites: Site[];
  facilities: Facility[];
  facilityIds: string[];
  hostOrg?: unknown;
}) {
  const site = sites.find(s => s.id === event.siteId);
  const timeZone = venueTimeZone(site as any, hostOrg as any);

  /* -- the venue's other bookings and shared ground, read on opening and after each move -- */
  const [context, setContext] = useState<ScheduleContext | null>(null);
  const loadContext = useCallback(async () => {
    if (!canEdit) return;
    const res = await sendAction(SocketAction.GET_SCHEDULE_CONTEXT, { eventId: event.id, orgId });
    if (res.ok) setContext(res.data);
  }, [canEdit, event.id, orgId]);
  useEffect(() => { loadContext(); }, [loadContext]);

  const model = useMemo(() => scheduleModel({ event, divisions, games, sports, timeZone }), [event, divisions, games, sports, timeZone]);
  const ground = useMemo(() => sharedGroundMap(context?.sharedGround || []), [context]);
  const allBookings = useMemo(() => [...model.bookings, ...(context?.bookings || [])], [model, context]);
  const clashes = useMemo(() => findClashes(allBookings, ground), [allBookings, ground]);

  const divisionOf = (id?: string | null) => divisions.find(d => d.id === id);
  const sportName = (id?: string | null) => sports.find(s => s.id === id)?.name || '';
  const divisionName = (id?: string | null) => { const d = divisionOf(id); return d ? divisionFullName(d.name, sportName(d.sportId)) : 'Another event'; };
  const facilityOf = (id?: string | null) => facilities.find(f => f.id === id);
  const sitesInPlay = new Set(facilityIds.map(id => facilityOf(id)?.siteId).filter(Boolean));
  const siteName = (id?: string) => sites.find(s => s.id === id)?.name || '';
  /** D16: with more than one venue in play, a facility is named with its venue. */
  const facilityLabel = (id?: string | null) => {
    const f = facilityOf(id);
    if (!f) return 'No facility';
    return sitesInPlay.size > 1 ? `${siteName(f.siteId)} · ${f.name}` : f.name;
  };
  const gameOf = (id: string) => games.find(g => g.id === id);

  /** The facilities a division's view shows: its own, any of its fixtures are on, and their shared ground. */
  const divisionFacilityIds = (id: string): Set<string> => {
    const d = divisionOf(id);
    const own = d?.facilityIds?.length ? d.facilityIds
      : facilityIds.filter(fid => { const f = facilityOf(fid); return !!f && (f.primarySportId === d?.sportId || (f.supportedSportIds || []).includes(d?.sportId || '')); });
    const ids = new Set<string>([...own, ...games.filter(g => g.divisionId === id && g.facilityId).map(g => g.facilityId!)]);
    [...ids].forEach(fid => (ground[fid] || []).forEach(o => ids.add(o)));
    return ids;
  };

  /* -- words for a clash -- */
  const competitorName = (id?: string) => {
    for (const g of games) for (const p of g.participants || []) if (p.teamId === id || p.entrantId === id || (p as any).orgProfileId === id) return p.name || 'A team';
    return 'A team';
  };
  const bookingOf = (id: string) => allBookings.find(b => b.id === id);
  const span = (id: string) => { const b = bookingOf(id); return b ? `${timeOfDay(b.start)}–${timeOfDay(b.start + b.minutes)}` : ''; };
  const whoOf = (id: string) => (gameOf(id) ? divisionName(gameOf(id)?.divisionId) : bookingOf(id)?.label || 'Another event');
  const clashText = (c: Clash): { title: string; detail: string; icon: ComponentProps<typeof Ionicons>['name'] } => {
    const pair = c.ids.map(id => `${whoOf(id)} ${span(id)}`).join(' · ');
    switch (c.kind) {
      case 'facility': return { icon: 'grid-outline', title: `${facilityOf(c.facilityIds[0])?.name || 'A facility'} is booked twice`, detail: pair };
      case 'sharedGround': return { icon: 'layers-outline', title: `${facilityOf(c.facilityIds[0])?.name} and ${facilityOf(c.facilityIds[1])?.name} share ground`, detail: pair };
      case 'gap': return { icon: 'hourglass-outline', title: `${c.minutesBetween} min between games on ${facilityOf(c.facilityIds[0])?.name}`, detail: `Between games is ${c.minutesWanted} min · ${pair}` };
      case 'teamAtOnce': return { icon: 'people-outline', title: `${competitorName(c.competitor)} plays two games at once`, detail: pair };
      case 'teamBreak': return { icon: 'timer-outline', title: `${competitorName(c.competitor)} gets ${c.minutesBetween} min between games`, detail: `The minimum team break is ${c.minutesWanted} min` };
      case 'afterDayEnd': return { icon: 'alarm-outline', title: `${whoOf(c.ids[0])} runs past the day's end`, detail: span(c.ids[0]) };
    }
  };

  /** What moving `g` to this facility, day and start would clash with — before it is moved. */
  const wouldClash = (g: GameSummary, facilityId: string, day: string, start: number): string[] => {
    const minutes = model.minutesOf(g) ?? 60;
    const self: Booking = {
      id: g.id, day, facilityId, start, minutes,
      competitors: (g.participants || []).map(p => p.teamId || p.entrantId).filter(Boolean) as string[],
      gap: bookingOf(g.id)?.gap, teamBreak: bookingOf(g.id)?.teamBreak,
      dayEnds: model.windowsOf(g.divisionId).find(w => w.day === day)?.ends,
    };
    return findClashes([...allBookings.filter(b => b.id !== g.id), self], ground).filter(c => c.ids.includes(g.id)).map(c => clashText(c).title);
  };

  return {
    timeZone, context, loadContext, model, ground, allBookings, clashes,
    divisionOf, sportName, divisionName, facilityOf, siteName, facilityLabel, gameOf, divisionFacilityIds,
    competitorName, bookingOf, span, clashText, wouldClash,
  };
}
