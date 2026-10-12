import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Booking, Clash, Event, Facility, GameSummary, ScheduleContext, Site, SocketAction, Sport, TournamentDivision,
  divisionFullName, findClashes, minuteOfDay, sharedGroundMap, timeOfDay,
} from '@sk/shared';
import CustomSelect from '../CustomSelect';
import { EditDialog } from '../EditDialog';
import { TournamentCard } from './TournamentBits';
import { isUnscheduled, scheduleModel } from './scheduleModel';
import { ScheduleDivisionDialog } from './ScheduleActions';
import { sendAction } from '../../services/actions';
import { useWsStore } from '../../store/wsStore';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';
import { formatPlayingDay, venueInputsToInstant, venueTimeZone, type CalendarDate } from '../../utils/dates';

/**
 * The tournament's **Schedule** tab (Phase 7, agreed on `mockups/tournament-schedule.html`).
 *
 * - **Wide: a time × facility grid** for one day (U24) — facilities grouped under their venue, the
 *   day's window plain and the time outside it hatched, *Day ends* marked. **Narrow: a list** for the
 *   day, grouped by start time, every facility named with its venue (D16).
 * - **Three dropdowns** filter it: Day, Division (by sport, *All divisions* first) and Facility (by
 *   venue). A division narrows the grid to its facilities — its own, any its fixtures were moved onto,
 *   and any sharing ground with those — and narrows the clashes and the tray with it.
 * - **Moving a fixture** (U23): dragged on the web, its **top edge** landing where it is dropped,
 *   snapped to five minutes, with a dashed preview of exactly where and whether it clashes; or, on
 *   any screen, the **move sheet** opened by tapping it. Never blocked (U26): a move that clashes is
 *   made and says so, with *Undo*.
 * - **Clashes** (U26) are the shared check's (`findClashes`) — the server's scheduler avoids exactly
 *   these — over the tournament's fixtures and other events' at its facilities.
 * - **Without a time** (U25): what is left to place, by division.
 * - **Offline** (U20): the schedule reads; moving needs a connection.
 */

const PX = 1.4; // pixels a minute
const STEP = 5;
type DayChoice = CalendarDate;

interface Props {
  event: Event;
  orgId: string;
  canEdit: boolean;
  isWide: boolean;
  divisions: TournamentDivision[];
  games: GameSummary[];
  sports: Sport[];
  sites: Site[];
  facilities: Facility[];
  /** The tournament's facilities. */
  facilityIds: string[];
  hostOrg?: { timezone?: string | null } | null;
}

/** How far each overlapping fixture is set in from the one beneath it, so that one stays reachable. */
const LANE_INDENT = 18;

/**
 * Lanes for one facility's fixtures on a day: a fixture overlapping one already placed goes in the
 * next lane up, drawn set in by `LANE_INDENT` and above it. Fixtures that do not overlap share lane 0.
 */
export function overlapLanes(items: Array<{ id: string; start: number; minutes: number }>): Map<string, number> {
  const lanes = new Map<string, number>();
  const placed: Array<{ start: number; end: number; lane: number }> = [];
  for (const b of [...items].sort((x, y) => x.start - y.start || x.id.localeCompare(y.id))) {
    const end = b.start + b.minutes;
    const busy = new Set(placed.filter(p => p.start < end && b.start < p.end).map(p => p.lane));
    let lane = 0;
    while (busy.has(lane)) lane++;
    lanes.set(b.id, lane);
    placed.push({ start: b.start, end, lane });
  }
  return lanes;
}

const plural = (n: number, word: string, many?: string) => `${n} ${n === 1 ? word : many || `${word}s`}`;

/** A side as the schedule names it: the organisation's short code and the team — "DKL U16 A". */
const sideName = (p?: GameSummary['participants'][number]) => {
  if (!p) return 'TBC';
  const team = p.teamShortName || p.name || p.entrantLabel || 'TBC';
  return p.orgShortName && !team.startsWith(p.orgShortName) ? `${p.orgShortName} ${team}` : team;
};
const fixtureName = (g?: GameSummary) => { const [home, away] = g?.participants || []; return `${sideName(home)} v ${sideName(away)}`; };

/** Each division's colour on the grid — theme tokens, in turn. */
const DIVISION_TONES = ['info', 'special', 'success', 'primary', 'accent', 'warning', 'danger'] as const;

export function ScheduleTab({ event, orgId, canEdit, isWide, divisions, games, sports, sites, facilities, facilityIds, hostOrg }: Props) {
  const router = useRouter();
  const isDark = useActiveTheme() === 'dark';
  const online = useWsStore((s: any) => s.isConnected);
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

  /* -- filters ----------------------------------------------------------------------------- */
  const playingDays = (event.days || []).map(d => d.day);
  const fixtureDays = [...new Set(model.bookings.map(b => b.day))].sort();
  const days: DayChoice[] = playingDays.length ? playingDays : fixtureDays;
  const [day, setDay] = useState<DayChoice>(days[0] || '');
  useEffect(() => { if (!days.includes(day) && days.length) setDay(days[0]); }, [days.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const [divisionId, setDivisionId] = useState('all');
  const [facilityId, setFacilityId] = useState('all');

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
  const toneOf = (divisionId?: string | null) => {
    const i = divisions.findIndex(d => d.id === divisionId);
    return themeColor(isDark, i < 0 ? 'line-strong' : DIVISION_TONES[i % DIVISION_TONES.length]);
  };

  /** The facilities a division's view shows: its own, any of its fixtures are on, and their shared ground. */
  const divisionFacilityIds = (id: string): Set<string> => {
    const d = divisionOf(id);
    const own = d?.facilityIds?.length ? d.facilityIds
      : facilityIds.filter(fid => { const f = facilityOf(fid); return !!f && (f.primarySportId === d?.sportId || (f.supportedSportIds || []).includes(d?.sportId || '')); });
    const ids = new Set<string>([...own, ...games.filter(g => g.divisionId === id && g.facilityId).map(g => g.facilityId!)]);
    [...ids].forEach(fid => (ground[fid] || []).forEach(o => ids.add(o)));
    return ids;
  };
  const inDivision = (g?: GameSummary) => divisionId === 'all' || g?.divisionId === divisionId;
  const columnIds = useMemo(() => {
    const keep = divisionId === 'all' ? null : divisionFacilityIds(divisionId);
    const used = new Set(games.filter(g => g.facilityId && model.placeOf(g)?.day === day).map(g => g.facilityId!));
    const ids = [...new Set([...facilityIds, ...used])].filter(id => {
      const f = facilityOf(id);
      if (!f || (f.isActive === false && !used.has(id))) return false;
      if (f.category && !['sport_field', 'indoor_hall'].includes(f.category) && !used.has(id)) return false;
      return !keep || keep.has(id);
    });
    const ordered = ids.sort((a, b) => (facilityOf(a)?.siteId || '').localeCompare(facilityOf(b)?.siteId || '') || (facilityOf(a)?.name || '').localeCompare(facilityOf(b)?.name || ''));
    return facilityId === 'all' ? ordered : ordered.filter(id => id === facilityId);
  }, [divisionId, facilityId, facilityIds, facilities, games, day, model, ground]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The clashes on the day, narrowed to the division: one with another division shows under both. */
  const dayClashes = clashes.filter(c => c.day === day && (divisionId === 'all' || c.ids.some(id => gameOf(id)?.divisionId === divisionId)));
  const clashIds = new Set(clashes.filter(c => c.day === day).flatMap(c => c.ids));
  const unscheduled = games.filter(g => isUnscheduled(g) && inDivision(g) && g.divisionId);

  /* -- words for a clash -- */
  const competitorName = (id?: string) => {
    for (const g of games) for (const p of g.participants || []) if (p.teamId === id || p.entrantId === id || (p as any).orgProfileId === id) return p.name || 'A team';
    return 'A team';
  };
  const bookingOf = (id: string) => allBookings.find(b => b.id === id);
  const span = (id: string) => { const b = bookingOf(id); return b ? `${timeOfDay(b.start)}–${timeOfDay(b.start + b.minutes)}` : ''; };
  const whoOf = (id: string) => (gameOf(id) ? divisionName(gameOf(id)?.divisionId) : bookingOf(id)?.label || 'Another event');
  const clashText = (c: Clash): { title: string; detail: string; icon: React.ComponentProps<typeof Ionicons>['name'] } => {
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

  /* -- moving ----------------------------------------------------------------------------- */
  const [moving, setMoving] = useState<GameSummary | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; warn?: string; undo?: () => void } | null>(null);
  const [scheduling, setScheduling] = useState<TournamentDivision | null>(null);
  const move = async (g: GameSummary, to: { day: string; start: number; facilityId: string } | null) => {
    const before = model.placeOf(g);
    const was = before && g.facilityId ? { day: before.day, start: before.start, facilityId: g.facilityId } : null;
    const send = (target: typeof to) => sendAction(SocketAction.MOVE_FIXTURE, {
      gameId: g.id, orgId,
      startAt: target ? venueInputsToInstant(target.day, timeOfDay(target.start), timeZone) : null,
      facilityId: target ? target.facilityId : null,
    });
    const res = await send(to);
    if (!res.ok) return;
    setFlash(g.id);
    loadContext();
    const warn = res.data.clashes.map(c => clashText(c).title).join(' · ');
    setToast({
      text: to ? `Moved to ${facilityOf(to.facilityId)?.name}, ${formatPlayingDay(to.day)} ${timeOfDay(to.start)}.` : 'It has no time now.',
      warn: warn || undefined,
      undo: async () => { setToast(null); await send(was); },
    });
  };

  /* -- the grid ---------------------------------------------------------------------------- */
  const window = (event.days || []).find(d => d.day === day);
  const dayStart = minuteOfDay(window?.dayStarts) ?? 8 * 60;
  const dayEnd = minuteOfDay(window?.dayEnds) ?? 17 * 60;
  const onDay = allBookings.filter(b => b.day === day);
  const g0 = Math.min(dayStart - 30, ...onDay.map(b => b.start - 15));
  const g1 = Math.max(dayEnd + 45, ...onDay.map(b => b.start + b.minutes + 15));
  const gridHeight = (g1 - g0) * PX;
  const hours: number[] = [];
  for (let m = Math.ceil(g0 / 60) * 60; m < g1; m += 60) hours.push(m);
  const quarters: number[] = [];
  for (let m = Math.ceil(g0 / 15) * 15; m < g1; m += 15) quarters.push(m);

  const drag = useRef<{ id: string; grab: number } | null>(null);
  const [preview, setPreview] = useState<{ facilityId: string; start: number; clashes: number } | null>(null);
  const startAt = (clientY: number, el: HTMLElement) => {
    const y = clientY - el.getBoundingClientRect().top - (drag.current?.grab || 0);
    return Math.round((g0 + y / PX) / STEP) * STEP;
  };
  const wouldClash = (g: GameSummary, fid: string, start: number) => {
    const minutes = model.minutesOf(g) ?? 60;
    const others = allBookings.filter(b => b.id !== g.id);
    const self: Booking = { ...(bookingOf(g.id) || { competitors: (g.participants || []).map(p => p.teamId || p.entrantId).filter(Boolean) as string[] }), id: g.id, day, facilityId: fid, start, minutes, dayEnds: model.windowsOf(g.divisionId).find(w => w.day === day)?.ends } as Booking;
    return findClashes([...others, self], ground).filter(c => c.ids.includes(g.id));
  };
  const web = Platform.OS === 'web';
  const canMove = canEdit && online;

  const block = (b: Booking, lane = 0) => {
    const g = gameOf(b.id);
    const other = !g;
    const faded = !other && !inDivision(g);
    const bad = clashIds.has(b.id);
    const division = g ? divisionOf(g.divisionId) : undefined;
    const [home, away] = g?.participants || [];
    const label = other ? 'Another event' : `${timeOfDay(b.start)} ${division?.name || ''}${g?.round ? ` R${g.round}` : ''}`;
    const inner = (
      <View
        className={`absolute rounded-md border px-1.5 py-0.5 overflow-hidden ${bad ? 'bg-warning-soft border-warning' : other ? 'bg-sunken border-line' : 'bg-card border-line'} ${flash === b.id ? 'border-primary' : ''}`}
        style={{ top: (b.start - g0) * PX, height: Math.max(18, b.minutes * PX - 2), left: 3 + lane * LANE_INDENT, right: 3, zIndex: 1 + lane, opacity: faded ? 0.35 : 1, borderLeftWidth: 4, borderLeftColor: other ? undefined : toneOf(g?.divisionId) }}
      >
        <Text className={`font-inter-bold text-[11px] ${bad ? 'text-warning-ink' : 'text-ink-soft'}`} numberOfLines={1}>{bad ? '⚠ ' : ''}{label}</Text>
        {!other ? <Text className="font-inter text-[11px] text-ink" numberOfLines={b.minutes > 45 ? 3 : 1}>{fixtureName(g)}</Text> : null}
      </View>
    );
    if (other) return <React.Fragment key={b.id}>{inner}</React.Fragment>;
    const open = () => (canEdit ? setMoving(g!) : router.push(`/admin/${orgId}/events/${event.id}/games/${b.id}/view`));
    if (web && canMove) {
      return (
        <div
          key={b.id}
          draggable
          onDragStart={(e: any) => {
            const rect = (e.currentTarget as HTMLElement).firstElementChild?.getBoundingClientRect();
            drag.current = { id: b.id, grab: rect ? e.clientY - rect.top : 0 };
            e.dataTransfer.setData('text/plain', b.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragEnd={() => { drag.current = null; setPreview(null); }}
          onClick={open}
          title={`${division?.name || ''} · ${fixtureName(g)} · ${span(b.id)}`}
          style={{ cursor: 'grab' }}
        >
          {inner}
        </div>
      );
    }
    return <TouchableOpacity key={b.id} onPress={open} accessibilityRole="button" accessibilityLabel={`${fixtureName(g)}, ${span(b.id)}`} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 0 }}>{inner}</TouchableOpacity>;
  };

  const column = (fid: string) => {
    const lines = quarters.map(m => (
      <View key={m} className={`absolute left-0 right-0 border-t ${m % 60 ? 'border-line-soft' : 'border-line'}`} style={{ top: (m - g0) * PX, borderStyle: m % 60 ? 'dotted' : 'dashed' }} />
    ));
    const shade = (
      <>
        <View className="absolute left-0 right-0 bg-sunken" style={{ top: 0, height: Math.max(0, (dayStart - g0) * PX), opacity: 0.6 }} />
        <View className="absolute left-0 right-0 bg-sunken" style={{ top: (dayEnd - g0) * PX, bottom: 0, opacity: 0.6 }} />
        <View className="absolute left-0 right-0 border-t-2 border-warning" style={{ top: (dayEnd - g0) * PX }} />
      </>
    );
    const ghost = preview && preview.facilityId === fid && drag.current ? (
      <View
        pointerEvents="none"
        className={`absolute rounded-md border-2 border-dashed px-1.5 ${preview.clashes ? 'border-warning bg-warning-soft' : 'border-primary bg-primary-soft'}`}
        style={{ top: (preview.start - g0) * PX, height: (model.minutesOf(gameOf(drag.current.id)!) ?? 60) * PX - 2, left: 3, right: 3, zIndex: 5 }}
      >
        <Text className={`font-inter-bold text-[11px] ${preview.clashes ? 'text-warning-ink' : 'text-primary-ink'}`} numberOfLines={1}>
          {timeOfDay(preview.start)} – {timeOfDay(preview.start + (model.minutesOf(gameOf(drag.current.id)!) ?? 60))}
        </Text>
        {preview.clashes ? <Text className="font-inter-semibold text-[11px] text-warning-ink">⚠ {plural(preview.clashes, 'clash', 'clashes')}</Text> : null}
      </View>
    ) : null;
    const body = (
      <>
        {lines}{shade}
        {(() => {
          const here = onDay.filter(b => b.facilityId === fid);
          const lanes = overlapLanes(here);
          return here.map(b => block(b, lanes.get(b.id) || 0));
        })()}
        {ghost}
      </>
    );
    if (web && canMove) {
      return (
        <div
          key={fid}
          onDragOver={(e: any) => {
            e.preventDefault();
            const id = drag.current?.id;
            const g = id ? gameOf(id) : undefined;
            if (!g) return;
            const start = startAt(e.clientY, e.currentTarget as HTMLElement);
            if (preview?.facilityId !== fid || preview.start !== start) setPreview({ facilityId: fid, start, clashes: wouldClash(g, fid, start).length });
          }}
          onDrop={(e: any) => {
            e.preventDefault();
            const id = drag.current?.id;
            const g = id ? gameOf(id) : undefined;
            const start = startAt(e.clientY, e.currentTarget as HTMLElement);
            drag.current = null; setPreview(null);
            if (g) move(g, { day, start, facilityId: fid });
          }}
          data-testid={`schedule-column-${fid}`}
          style={{ position: 'relative', height: gridHeight, width: '100%' }}
        >
          {body}
        </div>
      );
    }
    return <View key={fid} style={{ height: gridHeight, width: '100%' }}>{body}</View>;
  };

  const siteGroups = [...new Set(columnIds.map(id => facilityOf(id)?.siteId || ''))];
  const grid = (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <View className="flex-row" style={{ minWidth: '100%' as any }}>
        <View style={{ width: 46, marginTop: 50, height: gridHeight }}>
          {hours.map(m => (
            <Text key={m} className="absolute font-inter text-[11px] text-ink-muted" style={{ top: (m - g0) * PX - 7 }}>{timeOfDay(m)}</Text>
          ))}
          <Text className="absolute font-inter-bold text-[10px] text-warning-ink" style={{ top: (dayEnd - g0) * PX + 2 }}>Day ends</Text>
        </View>
        <View className="flex-1 flex-row gap-1.5">
          {siteGroups.map(siteId => (
            <View key={siteId} className="flex-1" style={{ minWidth: columnIds.filter(id => facilityOf(id)?.siteId === siteId).length * 108 }}>
              <Text className="font-inter-bold text-[11px] text-ink-muted uppercase tracking-wider border-b border-line pb-1" numberOfLines={1} style={{ height: 22 }}>{siteName(siteId)}</Text>
              <View className="flex-row gap-1.5">
                {columnIds.filter(id => facilityOf(id)?.siteId === siteId).map(fid => (
                  <View key={fid} className="flex-1" style={{ minWidth: 104 }}>
                    <View className="flex-row items-center gap-1" style={{ height: 28 }}>
                      <Text className="font-inter-bold text-[13px] text-ink" numberOfLines={1}>{facilityOf(fid)?.name}</Text>
                      {(ground[fid] || []).length ? <Ionicons name="layers-outline" size={13} color={themeColor(isDark, 'ink-muted')} accessibilityLabel={`Shares ground with ${(ground[fid] || []).map(o => facilityOf(o)?.name).join(', ')}`} /> : null}
                    </View>
                    <View className="rounded-lg border border-line-soft bg-card overflow-hidden">{column(fid)}</View>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );

  /* -- the phone list -- */
  const listed = games
    .filter(g => !isUnscheduled(g) && inDivision(g) && model.placeOf(g)?.day === day && (facilityId === 'all' || g.facilityId === facilityId))
    .sort((a, b) => (model.placeOf(a)!.start - model.placeOf(b)!.start) || facilityLabel(a.facilityId).localeCompare(facilityLabel(b.facilityId)));
  const byStart = new Map<number, GameSummary[]>();
  listed.forEach(g => { const s = model.placeOf(g)!.start; byStart.set(s, [...(byStart.get(s) || []), g]); });
  const list = (
    <View>
      {[...byStart.entries()].map(([start, rows]) => (
        <View key={start} className="gap-1.5 mb-1">
          <Text className="font-inter-bold text-[11px] text-ink-muted uppercase tracking-wider mt-2">{timeOfDay(start)}</Text>
          {rows.map(g => {
            const [home, away] = g.participants || [];
            const why = clashes.filter(c => c.ids.includes(g.id)).map(c => clashText(c).title);
            return (
              <TouchableOpacity
                key={g.id}
                onPress={() => (canEdit ? setMoving(g) : router.push(`/admin/${orgId}/events/${event.id}/games/${g.id}/view`))}
                accessibilityRole="button"
                className={`flex-row items-center gap-2 rounded-lg px-3 py-2 border-l-4 ${why.length ? 'bg-warning-soft' : 'bg-sunken'}`}
                style={{ borderLeftColor: toneOf(g.divisionId) }}
              >
                <View className="flex-1 min-w-0">
                  <Text className="font-inter-semibold text-sm text-ink" numberOfLines={2}>{fixtureName(g)}</Text>
                  <Text className="font-inter text-xs text-ink-muted" numberOfLines={1}>{divisionName(g.divisionId)} · {facilityLabel(g.facilityId)}</Text>
                  {why.length ? <Text className="font-inter-semibold text-xs text-warning-ink">⚠ {why.join(' · ')}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={14} color={themeColor(isDark, 'ink-muted')} />
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
      {!listed.length ? <Text className="font-inter text-sm text-ink-muted py-2">Nothing on this day{divisionId !== 'all' ? ' for this division' : ''}.</Text> : null}
    </View>
  );

  /* -- the side: clashes and the tray -- */
  const [panelOpen, setPanelOpen] = useState(isWide);
  const [trayOpen, setTrayOpen] = useState(isWide);
  const clashPanel = canEdit && dayClashes.length && (isWide || panelOpen) ? (
    <TournamentCard title={`Clashes on ${formatPlayingDay(day)?.split(' ')[0] || ''}`} count={dayClashes.length}>
      <Text className="font-inter text-xs text-ink-muted">Nothing is blocked — move a fixture, or leave it if you know better.</Text>
      <View>
        {dayClashes.map((c, i) => {
          const t = clashText(c);
          return (
            <TouchableOpacity key={`${c.kind}-${c.ids.join()}-${i}`} onPress={() => setFlash(c.ids.find(id => gameOf(id)) || null)} accessibilityRole="button" className={`flex-row gap-2.5 py-2 ${i ? 'border-t border-line-soft' : ''}`}>
              <Ionicons name={t.icon} size={16} color={themeColor(isDark, 'warning-ink')} />
              <View className="flex-1 min-w-0">
                <Text className="font-inter-semibold text-sm text-ink">{t.title}</Text>
                <Text className="font-inter text-xs text-ink-muted">{t.detail}</Text>
              </View>
              <Text className="font-inter text-xs text-ink-muted">{timeOfDay(c.at)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </TournamentCard>
  ) : null;

  const trayGroups = [...new Set(unscheduled.map(g => g.divisionId!))];
  const trayChip = (g: GameSummary) => {
    const [home, away] = g.participants || [];
    const inner = (
      <View className="flex-row items-center gap-2 rounded-lg border border-line border-l-4 bg-card px-2.5 py-1.5 mb-1" style={{ borderLeftColor: toneOf(g.divisionId) }}>
        <Text className="flex-1 font-inter text-[13px] text-ink" numberOfLines={1}>{fixtureName(g)}</Text>
        {g.round ? <Text className="font-inter text-xs text-ink-muted">R{g.round}</Text> : null}
      </View>
    );
    if (web && canMove) {
      return (
        <div
          key={g.id}
          draggable
          onDragStart={(e: any) => { drag.current = { id: g.id, grab: 0 }; e.dataTransfer.setData('text/plain', g.id); e.dataTransfer.effectAllowed = 'move'; }}
          data-testid={`schedule-tray-${g.id}`}
          onDragEnd={() => { drag.current = null; setPreview(null); }}
          onClick={() => setMoving(g)}
          style={{ cursor: 'grab' }}
        >
          {inner}
        </div>
      );
    }
    return <TouchableOpacity key={g.id} onPress={() => canEdit && setMoving(g)} accessibilityRole="button">{inner}</TouchableOpacity>;
  };
  const trayBody = (
    <View className="gap-1">
      {isWide && canMove ? <Text className="font-inter text-xs text-ink-muted">Drag onto the grid to place one. Drag a fixture here to take its time away.</Text> : null}
      {trayGroups.map(id => {
        const d = divisionOf(id);
        const neverScheduled = d && !games.some(g => g.divisionId === id && !isUnscheduled(g));
        return (
          <View key={id} className="gap-1">
            <View className="flex-row items-center gap-2 mt-2">
              <Text className="flex-1 font-inter-bold text-[11px] text-ink-muted uppercase tracking-wider">{divisionName(id)} · {unscheduled.filter(g => g.divisionId === id).length}</Text>
              {canEdit && neverScheduled ? (
                <TouchableOpacity onPress={() => setScheduling(d!)} accessibilityRole="button"><Text className="font-inter-bold text-[13px] text-primary-ink">Schedule</Text></TouchableOpacity>
              ) : null}
            </View>
            {unscheduled.filter(g => g.divisionId === id).map(trayChip)}
          </View>
        );
      })}
    </View>
  );
  const tray = unscheduled.length ? (
    web && canMove && isWide ? (
      <div
        onDragOver={(e: any) => e.preventDefault()}
        onDrop={(e: any) => {
          e.preventDefault();
          const g = drag.current ? gameOf(drag.current.id) : undefined;
          drag.current = null; setPreview(null);
          if (g && !isUnscheduled(g)) move(g, null);
        }}
      >
        <TournamentCard title="Without a time" count={unscheduled.length}>{trayBody}</TournamentCard>
      </div>
    ) : (
      <TournamentCard title="Without a time" count={unscheduled.length} folded={isWide ? undefined : !trayOpen} summary={`${plural(unscheduled.length, 'fixture')} to place`} onToggle={isWide ? undefined : () => setTrayOpen(o => !o)}>
        {trayBody}
      </TournamentCard>
    )
  ) : null;

  /* -- the toolbar: Day, Division, Facility, and the clash count -- */
  const sportsInPlay = [...new Set(divisions.map(d => d.sportId).filter(Boolean))] as string[];
  const toolbar = (
    <View className="flex-row flex-wrap items-center gap-2">
      <CustomSelect
        compact
        accessibilityLabel="Day"
        placeholder="Day"
        value={day}
        onChange={setDay}
        options={days.map(d => ({ value: d, label: formatPlayingDay(d) || d, description: plural(model.bookings.filter(b => b.day === d && gameOf(b.id)).length, 'fixture') }))}
      />
      <CustomSelect
        compact
        accessibilityLabel="Division"
        placeholder="Division"
        value={divisionId}
        onChange={id => { setDivisionId(id); if (id !== 'all' && facilityId !== 'all' && !divisionFacilityIds(id).has(facilityId)) setFacilityId('all'); }}
        options={[
          { value: 'all', label: 'All divisions' },
          ...sportsInPlay.flatMap(sid => divisions.filter(d => d.sportId === sid).map(d => ({ value: d.id, label: divisionFullName(d.name, sportName(sid)), group: sportName(sid) }))),
        ]}
      />
      <CustomSelect
        compact
        accessibilityLabel="Facility"
        placeholder="Facility"
        value={facilityId}
        onChange={setFacilityId}
        options={[
          { value: 'all', label: divisionId === 'all' ? 'All facilities' : `All of ${divisionName(divisionId)}'s` },
          ...[...new Set(facilityIds)].filter(id => divisionId === 'all' || divisionFacilityIds(divisionId).has(id))
            .map(id => facilityOf(id)).filter(Boolean)
            .sort((a, b) => a!.siteId.localeCompare(b!.siteId) || a!.name.localeCompare(b!.name))
            .map(f => ({ value: f!.id, label: f!.name, group: siteName(f!.siteId) })),
        ]}
      />
      <View className="flex-1" />
      {canEdit ? (
        dayClashes.length ? (
          <TouchableOpacity onPress={() => setPanelOpen(o => !o)} accessibilityRole="button" className="rounded-full bg-warning-soft px-3 py-1">
            <Text className="font-inter-bold text-xs text-warning-ink">⚠ {plural(dayClashes.length, 'clash', 'clashes')}</Text>
          </TouchableOpacity>
        ) : (
          <View className="flex-row items-center gap-1.5"><View className="w-2 h-2 rounded-full bg-success" /><Text className="font-inter-semibold text-xs text-success-ink">No clashes</Text></View>
        )
      ) : null}
    </View>
  );

  const scheduledCount = games.filter(g => !isUnscheduled(g) && inDivision(g) && model.placeOf(g)?.day === day).length;
  const offline = canEdit && !online ? (
    <View className="rounded-xl bg-warning-soft px-3.5 py-2.5"><Text className="font-inter text-sm text-warning-ink"><Text className="font-inter-bold">You're offline.</Text> This is the schedule as it last arrived. Results you enter are sent when the connection is back; moving fixtures and scheduling need a connection.</Text></View>
  ) : null;

  if (!days.length) {
    return (
      <TournamentCard title="Schedule">
        <Text className="font-inter text-sm text-ink-muted">{canEdit ? "Set the tournament's playing days under When on the Overview, then schedule each division once it is drawn." : 'The schedule is not out yet.'}</Text>
      </TournamentCard>
    );
  }

  return (
    <View className="gap-3">
      {offline}
      {toolbar}
      {isWide ? (
        <View className="flex-row gap-4 items-start">
          <View className="min-w-0" style={{ flex: 3 }}>
            <TournamentCard title="Scheduled" count={scheduledCount}>{grid}</TournamentCard>
          </View>
          {canEdit && (clashPanel || tray) ? <View className="gap-3" style={{ flex: 1, minWidth: 250 }}>{clashPanel}{tray}</View> : null}
        </View>
      ) : (
        <View className="gap-3">
          {clashPanel}
          {canEdit ? tray : null}
          <TournamentCard title="Scheduled" count={scheduledCount}>{list}</TournamentCard>
        </View>
      )}

      {toast ? (
        <View className={`flex-row items-center gap-3 rounded-xl px-3.5 py-2.5 ${toast.warn ? 'bg-warning-soft border border-warning-line' : 'bg-sunken border border-line'}`} accessibilityLiveRegion="polite">
          <View className="flex-1">
            <Text className="font-inter text-sm text-ink">{toast.text}</Text>
            {toast.warn ? <Text className="font-inter-semibold text-sm text-warning-ink">⚠ {toast.warn} — moved anyway.</Text> : null}
          </View>
          {toast.undo ? <TouchableOpacity onPress={toast.undo} accessibilityRole="button"><Text className="font-inter-bold text-sm text-primary-ink">Undo</Text></TouchableOpacity> : null}
          <TouchableOpacity onPress={() => setToast(null)} accessibilityRole="button" accessibilityLabel="Dismiss"><Ionicons name="close" size={16} color={themeColor(isDark, 'ink-muted')} /></TouchableOpacity>
        </View>
      ) : null}

      {moving ? (
        <MoveSheet
          game={moving}
          event={event}
          days={days}
          division={divisionOf(moving.divisionId)}
          facilities={facilities}
          facilityIds={facilityIds}
          divisionFacilityIds={moving.divisionId ? divisionFacilityIds(moving.divisionId) : new Set()}
          facilityLabel={facilityLabel}
          model={model}
          wouldClash={(fid, d, start) => {
            const g = moving;
            const minutes = model.minutesOf(g) ?? 60;
            const self: Booking = { id: g.id, day: d, facilityId: fid, start, minutes, competitors: (g.participants || []).map(p => p.teamId || p.entrantId).filter(Boolean) as string[], gap: bookingOf(g.id)?.gap, teamBreak: bookingOf(g.id)?.teamBreak, dayEnds: model.windowsOf(g.divisionId).find(w => w.day === d)?.ends };
            return findClashes([...allBookings.filter(b => b.id !== g.id), self], ground).filter(c => c.ids.includes(g.id)).map(c => clashText(c).title);
          }}
          online={online}
          onClose={() => setMoving(null)}
          onMove={async to => { const g = moving; setMoving(null); await move(g, to); }}
        />
      ) : null}
      {scheduling ? (
        <ScheduleDivisionDialog
          visible
          again={false}
          event={event}
          division={scheduling}
          sport={sports.find(s => s.id === scheduling.sportId)}
          facilities={facilities}
          games={games.filter(g => g.divisionId === scheduling.id)}
          orgId={orgId}
          onClose={() => setScheduling(null)}
          onChangeWhen={() => { setScheduling(null); router.push(`/admin/${orgId}/events/${event.id}/divisions/${scheduling.id}`); }}
        />
      ) : null}
    </View>
  );
}

/**
 * The move sheet (U23) — the phone's way to move a fixture, and the web's on a click: day, where (the
 * division's own facilities first, *Other…* for the rest of the tournament's), and the start. It says
 * what the move would clash with before it is made, and makes it anyway.
 */
function MoveSheet({ game, event, days, division, facilities, facilityIds, divisionFacilityIds, facilityLabel, model, wouldClash, online, onClose, onMove }: {
  game: GameSummary;
  event: Event;
  days: CalendarDate[];
  division?: TournamentDivision;
  facilities: Facility[];
  facilityIds: string[];
  divisionFacilityIds: Set<string>;
  facilityLabel: (id?: string | null) => string;
  model: ReturnType<typeof scheduleModel>;
  wouldClash: (facilityId: string, day: string, start: number) => string[];
  online: boolean;
  onClose: () => void;
  onMove: (to: { day: string; start: number; facilityId: string } | null) => void;
}) {
  const isDark = useActiveTheme() === 'dark';
  const placed = model.placeOf(game);
  const [day, setDay] = useState(placed?.day || days[0]);
  const window = (event.days || []).find(d => d.day === day);
  const [time, setTime] = useState(placed ? timeOfDay(placed.start) : window?.dayStarts || '08:00');
  const own = [...divisionFacilityIds].filter(id => facilityIds.includes(id) || id === game.facilityId);
  const [facilityId, setFacilityId] = useState(game.facilityId || own[0] || facilityIds[0]);
  const [showAll, setShowAll] = useState(false);
  const start = minuteOfDay(time);
  const [home, away] = game.participants || [];
  const minutes = model.minutesOf(game);
  const warnings = start != null && facilityId ? wouldClash(facilityId, day, start) : [];
  const choices = showAll ? [...new Set([...own, ...facilityIds])] : own.length ? own : facilityIds;
  const chip = (on: boolean, label: string, onPress: () => void, key: string) => (
    <TouchableOpacity key={key} onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }} aria-checked={on} className={`rounded-xl border px-3 py-1.5 ${on ? 'border-line-selected bg-raised' : 'border-line bg-card'}`}>
      <Text className={`font-inter-semibold text-[13px] ${on ? 'text-ink' : 'text-ink-muted'}`}>{label}</Text>
    </TouchableOpacity>
  );

  if (!online) {
    return (
      <EditDialog visible title={fixtureName(game)} onClose={onClose}>
        <Text className="font-inter text-sm text-ink">{placed ? `${formatPlayingDay(placed.day)} · ${timeOfDay(placed.start)} · ${facilityLabel(game.facilityId)}` : 'No time yet'}</Text>
        <View className="rounded-xl bg-warning-soft px-3 py-2"><Text className="font-inter text-[13px] text-warning-ink">You're offline. Moving a fixture needs a connection.</Text></View>
      </EditDialog>
    );
  }

  return (
    <EditDialog
      visible
      title={fixtureName(game)}
      onClose={onClose}
      onSave={start != null && facilityId ? () => onMove({ day, start, facilityId }) : undefined}
      saveLabel={placed ? 'Move' : 'Place it'}
      saveDisabled={start == null || !facilityId}
      footerLeft={placed ? (
        <TouchableOpacity onPress={() => onMove(null)} accessibilityRole="button"><Text className="font-inter-bold text-[13px] text-primary-ink">Take its time away</Text></TouchableOpacity>
      ) : undefined}
    >
      <Text className="font-inter text-xs text-ink-muted -mt-1">{[division?.name, game.round ? `Round ${game.round}` : '', minutes ? `${minutes} min` : ''].filter(Boolean).join(' · ')}</Text>
      <View className="gap-1.5">
        <Text className="font-inter-bold text-[13px] text-ink-soft">Day</Text>
        <View className="flex-row flex-wrap gap-1.5">{days.map(d => chip(d === day, formatPlayingDay(d) || d, () => setDay(d), d))}</View>
      </View>
      <View className="gap-1.5">
        <Text className="font-inter-bold text-[13px] text-ink-soft">Where</Text>
        <View className="flex-row flex-wrap gap-1.5">
          {choices.map(id => chip(id === facilityId, facilityLabel(id), () => setFacilityId(id), id))}
          {!showAll && facilityIds.some(id => !own.includes(id)) ? chip(false, 'Other…', () => setShowAll(true), 'other') : null}
        </View>
      </View>
      <View className="gap-1.5">
        <Text className="font-inter-bold text-[13px] text-ink-soft">Starts</Text>
        <View className="flex-row flex-wrap items-center gap-1.5">
          <TextInput
            value={time}
            onChangeText={setTime}
            accessibilityLabel="Starts"
            inputMode="numeric"
            placeholderTextColor={themeColor(isDark, 'ink-muted')}
            className="bg-canvas border border-line rounded-xl px-3 py-2 font-inter text-sm text-ink"
            style={{ width: 84, textAlign: 'center' }}
          />
          {start != null ? [-10, -5, 5, 10].map(dm => chip(false, timeOfDay(start + dm), () => setTime(timeOfDay(start + dm)), String(dm))) : null}
        </View>
        {start == null ? <Text className="font-inter text-xs text-danger-ink">A time is HH:MM.</Text> : null}
      </View>
      {warnings.length ? (
        <View className="rounded-xl bg-warning-soft px-3 py-2"><Text className="font-inter text-[13px] text-warning-ink">⚠ {warnings.join(' · ')}. You can still move it.</Text></View>
      ) : start != null ? (
        <View className="rounded-xl bg-sunken px-3 py-2"><Text className="font-inter text-[13px] text-ink-soft">No clash at this time.</Text></View>
      ) : null}
    </EditDialog>
  );
}
