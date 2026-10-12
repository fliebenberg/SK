import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  DivisionDay, Event, EventDay, Facility, GameSummary, Site, SocketAction, TournamentDivision, minuteOfDay,
} from '@sk/shared';
import { EditDialog } from '../EditDialog';
import { FieldLabel } from '../FieldLabel';
import { FacilityPicker } from './FacilityPicker';
import { sendAction } from '../../services/actions';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';
import {
  addCalendarDays, addMonths, dayOfMonth, formatPlayingDay, instantToVenueInputs, isCalendarDate, monthGrid, monthOf,
  todayCalendarDate, type CalendarDate, type TimeZone,
} from '../../utils/dates';

/**
 * Setting a tournament up to be scheduled (Phase 7, agreed on `mockups/tournament-schedule.html`):
 * the tournament's playing days and hours (*When*), a division's own days and hours, where a
 * division plays, and the two scheduling gaps. The rules these feed — how long a game is, when a
 * division plays, what clashes — are `@sk/shared`'s `utils/schedule.ts`; nothing here decides them.
 */

const TIME_INPUT = 'bg-canvas border border-line rounded-xl px-3 py-2 font-inter text-sm text-ink';
const validTime = (t?: string | null) => minuteOfDay(t) != null;

/** A time typed as HH:MM, narrow, in the app's input style. Greyed text is the value it follows. */
function TimeBox({ value, onChange, placeholder, label, warn, width = 84 }: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  label: string;
  warn?: boolean;
  /** Wider where the placeholder is a word — "Calculated". */
  width?: number;
}) {
  const isDark = useActiveTheme() === 'dark';
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder || 'e.g. 08:00'}
      placeholderTextColor={themeColor(isDark, 'ink-muted')}
      accessibilityLabel={label}
      inputMode="numeric"
      className={`${TIME_INPUT} ${warn ? 'border-warning' : ''}`}
      style={{ width, textAlign: 'center' }}
    />
  );
}

/* ---------------------------------------------------------------------------------------------
 * The tournament's playing days
 * ------------------------------------------------------------------------------------------- */

/** Ticks days on a month calendar; they need not follow each other. Two months on a wide screen. */
function DayCalendar({ selected, onToggle, startMonth }: {
  selected: Set<CalendarDate>;
  onToggle: (day: CalendarDate) => void;
  startMonth: CalendarDate;
}) {
  const isDark = useActiveTheme() === 'dark';
  const { width } = useWindowDimensions();
  const [month, setMonth] = useState(monthOf(startMonth));
  const today = todayCalendarDate();
  const months = width >= 720 ? [month, addMonths(month, 1)] : [month];
  const arrow = (dir: -1 | 1) => (
    <TouchableOpacity onPress={() => setMonth(addMonths(month, dir))} accessibilityRole="button" accessibilityLabel={dir < 0 ? 'Earlier months' : 'Later months'} hitSlop={8} className="w-8 h-8 rounded-full border border-line items-center justify-center">
      <Ionicons name={dir < 0 ? 'chevron-back' : 'chevron-forward'} size={14} color={themeColor(isDark, 'ink-muted')} />
    </TouchableOpacity>
  );
  return (
    <View className="flex-row gap-3 items-start">
      {arrow(-1)}
      {months.map(m => {
        const grid = monthGrid(m);
        return (
          <View key={m} className="flex-1 gap-1" style={{ minWidth: 210 }}>
            <Text className="font-inter-bold text-[13px] text-ink">{grid.label}</Text>
            <View className="flex-row flex-wrap">
              {grid.weekdays.map((w, i) => (
                <Text key={`w${i}`} className="font-inter-semibold text-[11px] text-ink-muted text-center" style={{ width: `${100 / 7}%` }}>{w}</Text>
              ))}
              {grid.cells.map((day, i) => {
                if (!day) return <View key={`e${i}`} style={{ width: `${100 / 7}%`, height: 30 }} />;
                const on = selected.has(day);
                return (
                  <TouchableOpacity
                    key={day}
                    onPress={() => onToggle(day)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    aria-checked={on}
                    accessibilityLabel={formatPlayingDay(day) || day}
                    style={{ width: `${100 / 7}%`, height: 30 }}
                    className="items-center justify-center"
                  >
                    <View className={`w-7 h-7 rounded-lg items-center justify-center ${on ? 'bg-primary' : day === today ? 'border border-line-strong' : ''}`}>
                      <Text className={`text-xs ${on ? 'font-inter-bold text-on-primary' : day < today ? 'font-inter text-ink-muted' : 'font-inter text-ink'}`}>{dayOfMonth(day)}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      })}
      {arrow(1)}
    </View>
  );
}

/**
 * The copy button on the first day's row: two chevrons, pointing at the days below. Its full
 * meaning shows on hover, as the unclaimed-organisation badge's does.
 */
function CopyDown({ onPress }: { onPress: () => void }) {
  const isDark = useActiveTheme() === 'dark';
  const [hovered, setHovered] = useState(false);
  const hint = 'Copy these times to every day';
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityLabel={hint}
      className="w-8 h-8 rounded-lg border border-line bg-card items-center justify-center"
      style={{ zIndex: hovered ? 30 : undefined }}
    >
      <Ionicons name="chevron-down" size={12} color={themeColor(isDark, 'ink-soft')} style={{ marginBottom: -6 }} />
      <Ionicons name="chevron-down" size={12} color={themeColor(isDark, 'ink-soft')} />
      {hovered ? (
        <View className="absolute bg-tooltip rounded-lg px-2.5 py-1.5 shadow-lg" style={{ bottom: 38, left: -70, width: 170 }} pointerEvents="none">
          <Text className="font-inter text-[11px] text-on-fill text-center">{hint}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

interface DayRow { day: CalendarDate; dayStarts: string; dayEnds: string }

/**
 * *When it's played* (H2, agreed 2026-10-11): days ticked on a calendar, then a row per day with
 * **Day starts** and **Day ends** — by when the last game must end. The copy button on the first
 * day's row copies its times to every other day. Saving replaces the days (`SET_EVENT_DAYS`); the
 * banner's dates follow from them.
 */
export function WhenDialog({ visible, event, orgId, games, timeZone, onClose }: {
  visible: boolean;
  event: Event;
  orgId: string;
  games: GameSummary[];
  timeZone: TimeZone;
  onClose: () => void;
}) {
  const isDark = useActiveTheme() === 'dark';
  const [rows, setRows] = useState<DayRow[]>([]);
  const [repeating, setRepeating] = useState(false);
  const [weeks, setWeeks] = useState(4);
  const [saving, setSaving] = useState(false);

  // Seeded on opening: its days, or — before any are set — the dates it was created with, untimed.
  useEffect(() => {
    if (!visible) return;
    if (event.days?.length) {
      setRows(event.days.map(d => ({ ...d })));
    } else if (isCalendarDate(event.startDate)) {
      const out: DayRow[] = [];
      let d: CalendarDate | null = event.startDate;
      const last = isCalendarDate(event.endDate) && event.endDate > event.startDate ? event.endDate : event.startDate;
      while (d && d <= last && out.length < 31) { out.push({ day: d, dayStarts: '', dayEnds: '' }); d = addCalendarDays(d, 1); }
      setRows(out);
    } else {
      setRows([]);
    }
    setRepeating(false);
  }, [visible, event]);

  const selected = useMemo(() => new Set(rows.map(r => r.day)), [rows]);
  const sorted = [...rows].sort((a, b) => a.day.localeCompare(b.day));
  const toggle = (day: CalendarDate) =>
    setRows(prev => prev.some(r => r.day === day) ? prev.filter(r => r.day !== day) : [...prev, { day, dayStarts: prev[0]?.dayStarts || '', dayEnds: prev[0]?.dayEnds || '' }]);
  const setRow = (day: CalendarDate, patch: Partial<DayRow>) => setRows(prev => prev.map(r => (r.day === day ? { ...r, ...patch } : r)));
  const copyFirst = () => {
    const first = sorted[0];
    if (first) setRows(prev => prev.map(r => ({ ...r, dayStarts: first.dayStarts, dayEnds: first.dayEnds })));
  };
  const repeatFrom = sorted[0]?.day || todayCalendarDate();
  const addWeekly = () => {
    const days: CalendarDate[] = [];
    let d: CalendarDate | null = repeatFrom;
    for (let i = 0; i < weeks && d; i++) { days.push(d); d = addCalendarDays(d, 7); }
    setRows(prev => {
      const have = new Set(prev.map(r => r.day));
      const template = prev[0] || { dayStarts: '', dayEnds: '' };
      return [...prev, ...days.filter(day => !have.has(day)).map(day => ({ day, dayStarts: template.dayStarts, dayEnds: template.dayEnds }))];
    });
    setRepeating(false);
  };

  const rowError = (r: DayRow) =>
    !validTime(r.dayStarts) || !validTime(r.dayEnds) ? 'Give it a start and an end, as HH:MM.'
      : minuteOfDay(r.dayEnds)! <= minuteOfDay(r.dayStarts)! ? 'The day must end after it starts.' : null;
  const invalid = sorted.some(r => !!rowError(r));

  // Fixtures already on a day being taken out stay where they are; say so before saving.
  const removed = (event.days || []).map(d => d.day).filter(d => !selected.has(d));
  const stranded = removed.length
    ? games.filter(g => g.startTime && !g.timeTbd && removed.includes(instantToVenueInputs(g.startTime, timeZone)?.date || '')).length
    : 0;

  const dirty = JSON.stringify(sorted) !== JSON.stringify(event.days || []);
  const save = async () => {
    if (invalid) return;
    setSaving(true);
    const result = await sendAction(SocketAction.SET_EVENT_DAYS, { eventId: event.id, orgId, days: sorted });
    setSaving(false);
    if (result.ok) onClose();
  };

  return (
    <EditDialog visible={visible} title="When it's played" onClose={onClose} onSave={save} isSaving={saving} isDirty={dirty} saveDisabled={!dirty || invalid || !sorted.length}>
      <View className="gap-2">
        <FieldLabel
          label="Playing days"
          help="Tap each day it is played; tap again to take it out. The days need not follow each other — Repeat weekly ticks a run of them for you."
        />
        <DayCalendar selected={selected} onToggle={toggle} startMonth={sorted[0]?.day || event.startDate || todayCalendarDate()} />
        {repeating ? (
          <View className="flex-row flex-wrap items-center gap-2 rounded-xl bg-sunken px-3 py-2">
            <Text className="font-inter text-sm text-ink">Every week from {formatPlayingDay(repeatFrom)}, for</Text>
            <TouchableOpacity onPress={() => setWeeks(w => Math.max(2, w - 1))} accessibilityRole="button" accessibilityLabel="Fewer weeks" className="w-7 h-7 rounded-lg border border-line items-center justify-center"><Text className="text-ink">−</Text></TouchableOpacity>
            <Text className="font-inter-bold text-sm text-ink">{weeks} weeks</Text>
            <TouchableOpacity onPress={() => setWeeks(w => Math.min(12, w + 1))} accessibilityRole="button" accessibilityLabel="More weeks" className="w-7 h-7 rounded-lg border border-line items-center justify-center"><Text className="text-ink">＋</Text></TouchableOpacity>
            <TouchableOpacity onPress={addWeekly} accessibilityRole="button" className="rounded-lg bg-primary px-3 py-1.5"><Text className="font-inter-bold text-[13px] text-on-primary">Add {weeks} days</Text></TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setRepeating(true)} accessibilityRole="button" className="self-end">
            <Text className="font-inter-bold text-[13px] text-primary-ink">Repeat weekly…</Text>
          </TouchableOpacity>
        )}
      </View>

      {sorted.length ? (
        <View className="gap-1">
          <FieldLabel
            label="Playing times"
            help="Day starts is when the first games begin; by Day ends the last games must be over — the scheduler works back from it for each division's game length. Times are the venue's. Fill in the first day, then press the double arrow beside its times to copy them to every other day. Change any day afterwards."
          />
          <View className="flex-row items-center gap-2 pl-1">
            <View className="flex-1" />
            <View style={{ width: 32 }} />
            <Text className="font-inter-bold text-[11px] text-ink-muted text-center" style={{ width: 84 }}>Day starts</Text>
            <Text className="font-inter-bold text-[11px] text-ink-muted text-center" style={{ width: 84 }}>Day ends</Text>
            <View style={{ width: 20 }} />
          </View>
          {sorted.map((r, i) => {
            const err = rowError(r);
            const typed = r.dayStarts || r.dayEnds;
            return (
              <View key={r.day} className="border-t border-line-soft py-1.5 gap-1">
                <View className="flex-row items-center gap-2">
                  <Text className="flex-1 font-inter-semibold text-sm text-ink">{formatPlayingDay(r.day)}</Text>
                  {i === 0 && sorted.length > 1 ? <CopyDown onPress={copyFirst} /> : <View style={{ width: 32 }} />}
                  <TimeBox value={r.dayStarts} onChange={v => setRow(r.day, { dayStarts: v })} label={`${formatPlayingDay(r.day)}, day starts`} warn={!!typed && !!err} />
                  <TimeBox value={r.dayEnds} onChange={v => setRow(r.day, { dayEnds: v })} label={`${formatPlayingDay(r.day)}, day ends`} warn={!!typed && !!err} />
                  <TouchableOpacity onPress={() => toggle(r.day)} accessibilityRole="button" accessibilityLabel={`Remove ${formatPlayingDay(r.day)}`} hitSlop={8} style={{ width: 20 }}>
                    <Ionicons name="close" size={16} color={themeColor(isDark, 'ink-muted')} />
                  </TouchableOpacity>
                </View>
                {typed && err ? <Text className="font-inter text-xs text-warning-ink">{err}</Text> : null}
              </View>
            );
          })}
        </View>
      ) : (
        <Text className="font-inter text-sm text-ink-muted">Tick the days it is played on the calendar.</Text>
      )}

      {stranded ? (
        <View className="rounded-xl bg-warning-soft px-3 py-2">
          <Text className="font-inter text-[13px] text-warning-ink">
            {stranded} {stranded === 1 ? 'fixture is' : 'fixtures are'} on a day you are taking out. {stranded === 1 ? 'It stays' : 'They stay'} where {stranded === 1 ? 'it is' : 'they are'}, and the schedule shows {stranded === 1 ? 'it' : 'them'} as outside the tournament's days.
          </Text>
        </View>
      ) : null}
    </EditDialog>
  );
}

/* ---------------------------------------------------------------------------------------------
 * The scheduling gaps
 * ------------------------------------------------------------------------------------------- */

const GAP_HELP = 'Time kept free on a court or field between one game ending and the next starting — to clear it and let the next teams in. Allow more where facilities are far apart, or games often run over.';
const BREAK_HELP = 'The least time a team gets between the end of one game and the start of its next. 0 means no minimum: a team can play straight after its last game — never in two at once.';

/** The gaps as read: "Between games 5 min · Minimum team break 15 min" — or "No minimum team break" for 0. */
export function gapsLine(gap: number, teamBreak: number): string {
  return `Between games ${gap} min · ${teamBreak ? `Minimum team break ${teamBreak} min` : 'No minimum team break'}`;
}

/**
 * *Scheduling*: Between games and the Minimum team break, each with its own ⓘ. For a division, the
 * tournament's values show greyed until typed over; clearing a field follows the tournament again.
 */
export function GapsDialog({ visible, event, division, orgId, onClose }: {
  visible: boolean;
  event: Event;
  /** Absent: the tournament's own gaps. */
  division?: TournamentDivision | null;
  orgId: string;
  onClose: () => void;
}) {
  const isDark = useActiveTheme() === 'dark';
  const tGap = event.gapBetweenGamesMin ?? 5, tBreak = event.minTeamBreakMin ?? 0;
  const [gap, setGap] = useState('');
  const [teamBreak, setTeamBreak] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (division) {
      setGap(division.gapBetweenGamesMin == null ? '' : String(division.gapBetweenGamesMin));
      setTeamBreak(division.minTeamBreakMin == null ? '' : String(division.minTeamBreakMin));
    } else {
      setGap(String(tGap));
      setTeamBreak(String(tBreak));
    }
  }, [visible, division, tGap, tBreak]);

  const parse = (v: string) => (v.trim() === '' ? null : /^\d{1,3}$/.test(v.trim()) && Number(v) <= 240 ? Number(v) : NaN);
  const g = parse(gap), b = parse(teamBreak);
  const invalid = Number.isNaN(g) || Number.isNaN(b) || (!division && (g == null || b == null));
  const was = division ? [division.gapBetweenGamesMin ?? null, division.minTeamBreakMin ?? null] : [tGap, tBreak];
  const dirty = g !== was[0] || b !== was[1];

  const save = async () => {
    if (invalid) return;
    setSaving(true);
    const result = division
      ? await sendAction(SocketAction.SET_DIVISION_SCHEDULING, { divisionId: division.id, orgId, gapBetweenGamesMin: g, minTeamBreakMin: b })
      : await sendAction(SocketAction.SET_EVENT_SCHEDULING, { eventId: event.id, orgId, gapBetweenGamesMin: g ?? tGap, minTeamBreakMin: b ?? tBreak });
    setSaving(false);
    if (result.ok) onClose();
  };

  const field = (label: string, help: string, value: string, set: (v: string) => void, inherited: number) => (
    <View className="flex-1 gap-1.5" style={{ minWidth: 150 }}>
      <FieldLabel label={label} help={help} />
      <View className="flex-row items-center gap-2">
        <TextInput
          value={value}
          onChangeText={set}
          placeholder={division ? String(inherited) : '0'}
          placeholderTextColor={themeColor(isDark, 'ink-muted')}
          accessibilityLabel={`${label}, minutes`}
          inputMode="numeric"
          className={TIME_INPUT}
          style={{ width: 84 }}
        />
        <Text className="font-inter text-sm text-ink-muted">min</Text>
      </View>
    </View>
  );

  return (
    <EditDialog visible={visible} title={division ? `Scheduling — ${division.name}` : 'Scheduling'} onClose={onClose} onSave={save} isSaving={saving} isDirty={dirty} saveDisabled={!dirty || invalid}>
      <View className="flex-row flex-wrap gap-4">
        {field('Between games', GAP_HELP, gap, setGap, tGap)}
        {field('Minimum team break', BREAK_HELP, teamBreak, setTeamBreak, tBreak)}
      </View>
      <Text className="font-inter text-xs text-ink-muted">
        {division ? "Greyed values are the tournament's; type over one to change it for this division, or clear it to follow the tournament again." : 'A division can change these.'}
      </Text>
      {invalid ? <Text className="font-inter text-xs text-danger-ink">A gap is a whole number of minutes, up to 240.</Text> : null}
    </EditDialog>
  );
}

/* ---------------------------------------------------------------------------------------------
 * A division's playing times, and where it plays
 * ------------------------------------------------------------------------------------------- */

interface DivisionDayRow { day: CalendarDate; plays: boolean; firstGameStart: string; lastGameEnds: string }

/**
 * A division's *When* (agreed 2026-10-11): each of the tournament's days is **Not playing** on one
 * line, or a **First game start** — greyed while it is the tournament's Day starts — and a **Last
 * game ends**, *Calculated* unless a time is set. Hours outside the tournament's for that day warn
 * but save. Only differences are sent (`SET_DIVISION_DAYS`).
 */
export function DivisionWhenDialog({ visible, event, division, orgId, onClose }: {
  visible: boolean;
  event: Event;
  division: TournamentDivision;
  orgId: string;
  onClose: () => void;
}) {
  const isDark = useActiveTheme() === 'dark';
  const [rows, setRows] = useState<DivisionDayRow[]>([]);
  const [saving, setSaving] = useState(false);
  const days = event.days || [];

  useEffect(() => {
    if (!visible) return;
    const own = new Map((division.days || []).map(d => [d.day, d]));
    setRows(days.map(d => {
      const o = own.get(d.day);
      return { day: d.day, plays: o ? o.plays : true, firstGameStart: o?.firstGameStart || '', lastGameEnds: o?.lastGameEnds || '' };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, division, event.days]);

  const setRow = (day: CalendarDate, patch: Partial<DivisionDayRow>) => setRows(prev => prev.map(r => (r.day === day ? { ...r, ...patch } : r)));
  const tournamentDay = (day: CalendarDate) => days.find(d => d.day === day)!;
  const problem = (r: DivisionDayRow) => {
    if (!r.plays) return null;
    if ((r.firstGameStart && !validTime(r.firstGameStart)) || (r.lastGameEnds && !validTime(r.lastGameEnds))) return { error: true, text: 'Times are HH:MM.' };
    const t = tournamentDay(r.day);
    const s = minuteOfDay(r.firstGameStart || t.dayStarts)!, e = r.lastGameEnds ? minuteOfDay(r.lastGameEnds)! : null;
    if (e != null && e <= s) return { error: true, text: 'The last game must end after the first starts.' };
    if (s < minuteOfDay(t.dayStarts)!) return { error: false, text: `Starts before the tournament's day starts on ${formatPlayingDay(r.day)} (${t.dayStarts}).` };
    if (e != null && e > minuteOfDay(t.dayEnds)!) return { error: false, text: `Ends after the tournament's day ends on ${formatPlayingDay(r.day)} (${t.dayEnds}).` };
    return null;
  };
  const invalid = rows.some(r => problem(r)?.error);
  const toSend: DivisionDay[] = rows
    .filter(r => !r.plays || r.firstGameStart || r.lastGameEnds)
    .map(r => ({ day: r.day, plays: r.plays, firstGameStart: r.plays ? r.firstGameStart || null : null, lastGameEnds: r.plays ? r.lastGameEnds || null : null }));
  const before = (division.days || []).map(d => ({ day: d.day, plays: d.plays, firstGameStart: d.firstGameStart || null, lastGameEnds: d.lastGameEnds || null }));
  const dirty = JSON.stringify(toSend) !== JSON.stringify(before);

  const save = async () => {
    if (invalid) return;
    setSaving(true);
    const result = await sendAction(SocketAction.SET_DIVISION_DAYS, { divisionId: division.id, orgId, days: toSend });
    setSaving(false);
    if (result.ok) onClose();
  };

  return (
    <EditDialog visible={visible} title={`When — ${division.name}`} onClose={onClose} onSave={save} isSaving={saving} isDirty={dirty} saveDisabled={!dirty || invalid}>
      <View className="gap-1">
        <FieldLabel
          label="Playing times"
          help="The tournament's playing days. A greyed start is the tournament's Day starts — type over it to start this division at another time. Leave Last game ends as Calculated and the scheduler works out when the last game finishes, by the tournament's Day ends at the latest; or set a time to finish earlier. × takes a day out; ＋ Play puts it back."
        />
        {!days.length ? <Text className="font-inter text-sm text-ink-muted">The tournament has no playing days yet. Set them under When on the tournament page.</Text> : null}
        {rows.map(r => {
          const t = tournamentDay(r.day);
          const p = problem(r);
          if (!r.plays) {
            return (
              <View key={r.day} className="flex-row items-center gap-3 border-t border-line-soft py-2">
                <Text className="flex-1 font-inter-semibold text-sm text-ink">{formatPlayingDay(r.day)}</Text>
                <Text className="font-inter text-sm text-ink-muted">Not playing</Text>
                <TouchableOpacity onPress={() => setRow(r.day, { plays: true })} accessibilityRole="button" accessibilityLabel={`Play on ${formatPlayingDay(r.day)}`}>
                  <Text className="font-inter-bold text-[13px] text-primary-ink">＋ Play</Text>
                </TouchableOpacity>
              </View>
            );
          }
          return (
            <View key={r.day} className="border-t border-line-soft py-2 gap-1.5">
              <View className="flex-row items-center gap-3">
                <Text className="flex-1 font-inter-semibold text-sm text-ink">{formatPlayingDay(r.day)}</Text>
                <TouchableOpacity onPress={() => setRow(r.day, { plays: false, firstGameStart: '', lastGameEnds: '' })} accessibilityRole="button" accessibilityLabel={`Not playing on ${formatPlayingDay(r.day)}`} hitSlop={8}>
                  <Ionicons name="close" size={16} color={themeColor(isDark, 'ink-muted')} />
                </TouchableOpacity>
              </View>
              <View className="flex-row gap-4">
                <View className="gap-1">
                  <Text className="font-inter-semibold text-xs text-ink-soft">First game start</Text>
                  <TimeBox value={r.firstGameStart} onChange={v => setRow(r.day, { firstGameStart: v })} placeholder={t.dayStarts} label={`${formatPlayingDay(r.day)}, first game start`} warn={!!p} />
                </View>
                <View className="gap-1">
                  <Text className="font-inter-semibold text-xs text-ink-soft">Last game ends</Text>
                  <TimeBox value={r.lastGameEnds} onChange={v => setRow(r.day, { lastGameEnds: v })} placeholder="Calculated" label={`${formatPlayingDay(r.day)}, last game ends`} warn={!!p} width={112} />
                </View>
              </View>
              {p ? (
                <View className={`rounded-lg px-3 py-1.5 ${p.error ? '' : 'bg-warning-soft'}`}>
                  <Text className={`font-inter text-xs ${p.error ? 'text-danger-ink' : 'text-warning-ink'}`}>{p.text}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </EditDialog>
  );
}

/**
 * A division's *Where*: its facilities, as chips with × and a ＋ for the facility picker. None
 * chosen means any of the tournament's that suit its sport. A facility the tournament does not use
 * yet is added to it too (`SET_DIVISION_FACILITIES`).
 */
export function DivisionWhereDialog({ visible, event, division, orgId, sites, facilities, facilityTerm, onClose }: {
  visible: boolean;
  event: Event;
  division: TournamentDivision;
  orgId: string;
  sites: Site[];
  facilities: Facility[];
  /** The sport's plural word for its facilities — Courts, Fields — or Facilities. */
  facilityTerm: string;
  onClose: () => void;
}) {
  const isDark = useActiveTheme() === 'dark';
  const [ids, setIds] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setIds(division.facilityIds || []);
    setPicking(false);
  }, [visible, division]);
  const name = (id: string) => facilities.find(f => f.id === id)?.name || 'A facility';
  const dirty = [...ids].sort().join() !== [...(division.facilityIds || [])].sort().join();
  const save = async () => {
    setSaving(true);
    const result = await sendAction(SocketAction.SET_DIVISION_FACILITIES, { divisionId: division.id, orgId, facilityIds: ids });
    setSaving(false);
    if (result.ok) onClose();
  };
  return (
    <EditDialog visible={visible} title={`Where — ${division.name}`} onClose={onClose} onSave={save} isSaving={saving} isDirty={dirty} saveDisabled={!dirty}>
      <View className="gap-1.5">
        <FieldLabel label={facilityTerm} optional help="Where this division plays. None chosen means any of the tournament's. One the tournament does not use yet is added to the tournament as well, so it shows on the map." />
        <View className="flex-row flex-wrap items-center gap-1.5">
          {ids.map(id => (
            <View key={id} className="flex-row items-center gap-1.5 rounded-xl border border-line bg-sunken px-3 py-1.5">
              <Text className="font-inter-semibold text-[13px] text-ink">{name(id)}</Text>
              <TouchableOpacity onPress={() => setIds(prev => prev.filter(x => x !== id))} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${name(id)}`}>
                <Ionicons name="close" size={14} color={themeColor(isDark, 'ink-muted')} />
              </TouchableOpacity>
            </View>
          ))}
          {!ids.length ? <Text className="font-inter text-[13px] text-ink-muted">Any of the tournament's.</Text> : null}
          <TouchableOpacity onPress={() => setPicking(p => !p)} accessibilityRole="button" accessibilityLabel={`Add ${facilityTerm.toLowerCase()}`} className="rounded-xl border border-dashed border-line-strong px-3 py-1.5">
            <Text className="font-inter-bold text-[13px] text-primary-ink">{picking ? 'Done' : '＋'}</Text>
          </TouchableOpacity>
        </View>
        {picking ? (
          <View className="rounded-xl border border-line p-3">
            <FacilityPicker sites={sites} facilities={facilities} value={ids} onChange={setIds} baseSiteId={event.siteId || undefined} />
          </View>
        ) : null}
      </View>
    </EditDialog>
  );
}

/** A division's days as read: each day with its hours, *Not playing*, or its end *calculated*. */
export function divisionDayLines(event: Event, division: TournamentDivision): Array<{ day: CalendarDate; text: string; muted: boolean }> {
  const own = new Map((division.days || []).map(d => [d.day, d]));
  return (event.days || []).map((t: EventDay) => {
    const o = own.get(t.day);
    if (o && !o.plays) return { day: t.day, text: 'Not playing', muted: true };
    const start = o?.firstGameStart || t.dayStarts;
    return { day: t.day, text: o?.lastGameEnds ? `${start} – ${o.lastGameEnds}` : `From ${start} · end calculated`, muted: false };
  });
}
