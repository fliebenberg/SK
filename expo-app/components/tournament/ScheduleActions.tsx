import React, { useEffect, useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Event, Facility, GameSummary, ScheduleAllResult, ScheduleDivisionResult, SocketAction, Sport, TournamentDivision,
  divisionFullName, fixtureMinutes,
} from '@sk/shared';
import { EditDialog } from '../EditDialog';
import { sendAction } from '../../services/actions';
import { useToastStore } from '../../store/toastStore';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';
import { formatPlayingDay } from '../../utils/dates';
import { divisionDayLines, gapsLine } from './ScheduleSetup';
import { isUnscheduled } from './scheduleModel';

/**
 * Running the scheduler (Phase 7, agreed on `mockups/tournament-schedule.html`): a division's
 * *Schedule* and *Schedule again*, the tournament's *Schedule all*, and what each did. The server
 * places only fixtures with no time — anything already placed stays and is scheduled around — and a
 * fixture that does not fit moves to the next playing day, running past the end only on the last.
 */

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** What a division would be scheduled with — said before it is, so nothing in the result surprises. */
export function scheduleReadiness({ event, division, sport }: { event: Event; division: TournamentDivision; sport?: Sport | null }):
  { ok: true; minutes: number } | { ok: false; reason: string } {
  if (!(event.days || []).length) return { ok: false, reason: "The tournament has no playing days yet. Set them under When on the tournament page." };
  const minutes = fixtureMinutes(sport?.defaultSettings as any);
  if (minutes == null) return { ok: false, reason: `${sport?.name || 'This sport'} has no game length yet. Set its period length and number of periods in the sport editor.` };
  if (!divisionDayLines(event, division).some(l => !l.muted)) return { ok: false, reason: 'This division plays on none of the tournament\'s days. Change that under its When.' };
  return { ok: true, minutes };
}

/** The result, as one message: how many placed, and the one warning that matters. */
export function scheduleResultMessage(r: ScheduleDivisionResult): { warn: boolean; text: string } {
  const parts = [`Placed ${plural(r.placed, 'fixture')}.`];
  if (r.afterDayEnd) parts.push(`${plural(r.afterDayEnd, 'fixture')} ${r.afterDayEnd === 1 ? 'runs' : 'run'} past the last day's end.`);
  if (r.unplaced) parts.push(`${plural(r.unplaced, 'fixture')} could not be placed.`);
  return { warn: !!(r.afterDayEnd || r.unplaced), text: parts.join(' ') };
}

/**
 * *Schedule* a division — or, with `again`, *Schedule again*, which places every fixture not yet
 * played afresh, keeping those placed by hand unless unticked. Says what it will use, with no
 * questions: everything comes from the division's settings.
 */
export function ScheduleDivisionDialog({ visible, again, event, division, sport, facilities, games, orgId, onClose, onChangeWhen }: {
  visible: boolean;
  again: boolean;
  event: Event;
  division: TournamentDivision;
  sport?: Sport | null;
  facilities: Facility[];
  games: GameSummary[];
  orgId: string;
  onClose: () => void;
  /** Opens the division's When — the link to change what it will use. */
  onChangeWhen: () => void;
}) {
  const isDark = useActiveTheme() === 'dark';
  const showSuccess = useToastStore(s => s.showSuccess);
  const showWarning = useToastStore(s => s.showWarning);
  const [keepHand, setKeepHand] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) setKeepHand(true); }, [visible]);

  const ready = scheduleReadiness({ event, division, sport });
  const toPlace = games.filter(isUnscheduled).length;
  const handPlaced = games.filter(g => (g as any).placedBy === 'hand' && !isUnscheduled(g)).length;
  const courts = (division.facilityIds || []).map(id => facilities.find(f => f.id === id)?.name).filter(Boolean);
  const gap = division.gapBetweenGamesMin ?? event.gapBetweenGamesMin ?? 5;
  const teamBreak = division.minTeamBreakMin ?? event.minTeamBreakMin ?? 0;
  const days = divisionDayLines(event, division).filter(l => !l.muted);

  const run = async () => {
    setBusy(true);
    const result = await sendAction(SocketAction.SCHEDULE_DIVISION, { divisionId: division.id, orgId, again, keepPlacedByHand: keepHand }, { timeoutMs: 20000 });
    setBusy(false);
    if (!result.ok) return;
    const message = scheduleResultMessage(result.data);
    (message.warn ? showWarning : showSuccess)(message.text, divisionFullName(division.name, sport?.name));
    onClose();
  };

  const row = (k: string, v: React.ReactNode) => (
    <View className="flex-row gap-3">
      <Text className="font-inter text-xs text-ink-muted pt-0.5" style={{ width: 90 }}>{k}</Text>
      <View className="flex-1">{typeof v === 'string' ? <Text className="font-inter text-sm text-ink">{v}</Text> : v}</View>
    </View>
  );

  return (
    <EditDialog
      visible={visible}
      title={again ? `Schedule ${division.name} again?` : `Schedule ${division.name}`}
      onClose={onClose}
      onSave={ready.ok ? run : undefined}
      saveLabel={again ? 'Schedule again' : 'Schedule'}
      saveDisabled={!ready.ok || (!again && !toPlace)}
      isSaving={busy}
    >
      {!ready.ok ? (
        <View className="rounded-xl bg-warning-soft px-3 py-2"><Text className="font-inter text-[13px] text-warning-ink">{ready.reason}</Text></View>
      ) : (
        <>
          <Text className="font-inter text-sm text-ink-soft">
            {again
              ? `Its ${plural(games.filter(g => g.status !== 'Cancelled').length, 'fixture')} not yet played get new times and facilities.`
              : `${plural(toPlace, 'fixture')} with no time, placed in round order. Fixtures that already have a time stay where they are.`}
          </Text>
          <View className="gap-2">
            {row(sport?.facilityTerm?.trim() ? `${sport.facilityTerm.trim()}s` : 'Facilities', courts.length ? courts.join(', ') : "Any of the tournament's for its sport")}
            {row('Days', (
              <View>{days.map(l => <Text key={l.day} className="font-inter text-sm text-ink">{formatPlayingDay(l.day)} · {l.text}</Text>)}</View>
            ))}
            {row('Each game', `${ready.minutes} min (${sport?.name || 'its sport'}'s), then ${gap} min before the next on a facility`)}
            {row('Team break', teamBreak ? `At least ${teamBreak} min` : 'No minimum')}
          </View>
          <TouchableOpacity onPress={onChangeWhen} accessibilityRole="link" className="self-start">
            <Text className="font-inter-bold text-[13px] text-primary-ink">Change these</Text>
          </TouchableOpacity>
          {again && handPlaced ? (
            <TouchableOpacity onPress={() => setKeepHand(k => !k)} accessibilityRole="checkbox" accessibilityState={{ checked: keepHand }} aria-checked={keepHand} className="flex-row items-center gap-2.5 border-t border-line-soft pt-2.5">
              <Ionicons name={keepHand ? 'checkbox' : 'square-outline'} size={18} color={themeColor(isDark, keepHand ? 'ink' : 'ink-faint')} />
              <Text className="font-inter text-sm text-ink">Keep the {plural(handPlaced, 'fixture')} placed by hand</Text>
            </TouchableOpacity>
          ) : null}
        </>
      )}
    </EditDialog>
  );
}

/**
 * *Schedule all*: every division with fixtures that have no time, one after the other. **Earlier in
 * the list gets first pick of shared facilities** — moved up and down here. Divisions with no draw
 * are listed as not included, with why. The result is a line per division.
 */
export function ScheduleAllDialog({ visible, event, divisions, games, sports, orgId, onClose }: {
  visible: boolean;
  event: Event;
  divisions: TournamentDivision[];
  games: GameSummary[];
  sports: Sport[];
  orgId: string;
  onClose: () => void;
}) {
  const isDark = useActiveTheme() === 'dark';
  const sportOf = (d: TournamentDivision) => sports.find(s => s.id === d.sportId);
  const nameOf = (d: TournamentDivision) => divisionFullName(d.name, sportOf(d)?.name);
  const gamesOf = (d: TournamentDivision) => games.filter(g => g.divisionId === d.id);
  const candidates = useMemo(() => divisions.filter(d => d.sportId && gamesOf(d).some(isUnscheduled)), [divisions, games]); // eslint-disable-line react-hooks/exhaustive-deps
  const notIncluded = divisions.filter(d => d.sportId && !candidates.includes(d) && !gamesOf(d).length);
  const [order, setOrder] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScheduleAllResult | null>(null);
  useEffect(() => {
    if (!visible) return;
    setOrder(candidates.map(d => d.id));
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const move = (id: string, dir: -1 | 1) => setOrder(prev => {
    const i = prev.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= prev.length) return prev;
    const next = [...prev];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const run = async () => {
    setBusy(true);
    const res = await sendAction(SocketAction.SCHEDULE_ALL, { eventId: event.id, orgId, divisionIds: order }, { timeoutMs: 60000 });
    setBusy(false);
    if (res.ok) setResult(res.data);
  };

  if (result) {
    return (
      <EditDialog visible={visible} title="Divisions scheduled" onClose={onClose} doneLabel="Done">
        {result.results.map(line => {
          const d = divisions.find(x => x.id === line.divisionId);
          const failed = 'error' in line;
          const message = failed ? { warn: true, text: (line as any).error } : scheduleResultMessage(line as ScheduleDivisionResult);
          return (
            <View key={line.divisionId} className="flex-row gap-2.5 border-t border-line-soft pt-2">
              <Ionicons name={message.warn ? 'warning-outline' : 'checkmark'} size={16} color={themeColor(isDark, message.warn ? 'warning' : 'success')} />
              <View className="flex-1">
                <Text className="font-inter-bold text-sm text-ink">{d ? nameOf(d) : 'A division'}</Text>
                <Text className={`font-inter text-[13px] ${message.warn ? 'text-warning-ink' : 'text-ink-muted'}`}>{message.text}</Text>
              </View>
            </View>
          );
        })}
      </EditDialog>
    );
  }

  return (
    <EditDialog
      visible={visible}
      title="Schedule all divisions"
      onClose={onClose}
      onSave={order.length && (event.days || []).length ? run : undefined}
      saveLabel={`Schedule ${plural(order.length, 'division')}`}
      saveDisabled={!order.length || !(event.days || []).length}
      isSaving={busy}
    >
      {!(event.days || []).length ? (
        <View className="rounded-xl bg-warning-soft px-3 py-2"><Text className="font-inter text-[13px] text-warning-ink">The tournament has no playing days yet. Set them under When first.</Text></View>
      ) : null}
      <Text className="font-inter text-sm text-ink-soft">
        Places every fixture that has no time yet, division by division. Fixtures that already have a time stay where they are. <Text className="font-inter-bold">Earlier in the list gets first pick of shared facilities</Text> — move a division up to give it first pick.
      </Text>
      {order.length ? (
        <View className="rounded-xl border border-line overflow-hidden">
          {order.map((id, i) => {
            const d = divisions.find(x => x.id === id)!;
            const n = gamesOf(d).filter(isUnscheduled).length;
            const total = gamesOf(d).filter(g => g.status !== 'Cancelled').length;
            return (
              <View key={id} className={`flex-row items-center gap-2.5 px-3 py-2 bg-card ${i ? 'border-t border-line-soft' : ''}`}>
                <View className="w-5 h-5 rounded-full bg-sunken items-center justify-center"><Text className="font-inter-bold text-[11px] text-ink-soft">{i + 1}</Text></View>
                <View className="flex-1 min-w-0">
                  <Text className="font-inter-semibold text-sm text-ink" numberOfLines={1}>{nameOf(d)}</Text>
                  <Text className="font-inter text-xs text-ink-muted" numberOfLines={1}>
                    {n === total ? plural(n, 'fixture') : `${n} of ${total} fixtures to place · the rest stay`} · {gapsLine(d.gapBetweenGamesMin ?? event.gapBetweenGamesMin ?? 5, d.minTeamBreakMin ?? event.minTeamBreakMin ?? 0).split(' · ')[0]}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => move(id, -1)} disabled={!i} accessibilityRole="button" accessibilityLabel={`Move ${nameOf(d)} up`} hitSlop={6}>
                  <Ionicons name="chevron-up" size={18} color={themeColor(isDark, i ? 'ink-soft' : 'ink-faint')} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => move(id, 1)} disabled={i === order.length - 1} accessibilityRole="button" accessibilityLabel={`Move ${nameOf(d)} down`} hitSlop={6}>
                  <Ionicons name="chevron-down" size={18} color={themeColor(isDark, i < order.length - 1 ? 'ink-soft' : 'ink-faint')} />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      ) : (
        <Text className="font-inter text-sm text-ink-muted">Every drawn division is scheduled. To redo one, use Schedule again on its page, or on the Schedule tab with it chosen.</Text>
      )}
      {notIncluded.length ? (
        <View className="gap-1">
          <Text className="font-inter-bold text-[11px] text-ink-muted uppercase tracking-wider">Not included</Text>
          {notIncluded.map(d => <Text key={d.id} className="font-inter text-[13px] text-ink-muted">{nameOf(d)} — no draw yet</Text>)}
        </View>
      ) : null}
    </EditDialog>
  );
}
