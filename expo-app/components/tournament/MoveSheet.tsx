import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Event, Facility, GameSummary, TournamentDivision, minuteOfDay, timeOfDay } from '@sk/shared';
import { EditDialog } from '../EditDialog';
import { scheduleModel } from './scheduleModel';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';
import { formatPlayingDay, type CalendarDate } from '../../utils/dates';

/** A side as the schedule names it: the organisation's short code and the team — "DKL U16 A". */
export const sideName = (p?: GameSummary['participants'][number]) => {
  if (!p) return 'TBC';
  const team = p.teamShortName || p.name || p.entrantLabel || 'TBC';
  return p.orgShortName && !team.startsWith(p.orgShortName) ? `${p.orgShortName} ${team}` : team;
};
export const fixtureName = (g?: GameSummary) => { const [home, away] = g?.participants || []; return `${sideName(home)} v ${sideName(away)}`; };

/**
 * The move sheet (U23) — the phone's way to move a fixture, and the web's on a click: day, where (the
 * division's own facilities first, *Other…* for the rest of the tournament's), and the start. It says
 * what the move would clash with before it is made, and makes it anyway — and nothing when there is
 * no clash (2026-10-15: no news is no message). Used by the Schedule tab and by a tournament
 * fixture's game page, so a fixture is placed the same way wherever it is moved from.
 */
export function MoveSheet({ game, event, days, division, facilities, facilityIds, divisionFacilityIds, facilityLabel, model, wouldClash, online, onClose, onMove }: {
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
        <TouchableOpacity onPress={() => onMove(null)} accessibilityRole="button"><Text className="font-inter-bold text-[13px] text-primary-ink">Remove time and court</Text></TouchableOpacity>
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
      ) : null}
    </EditDialog>
  );
}
