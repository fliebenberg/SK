import React, { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SocketAction } from '@sk/shared';
import { EditDialog } from '../EditDialog';
import { FieldLabel } from '../FieldLabel';
import { SegmentedControl } from '../SegmentedControl';
import DatePicker from '../DatePicker';
import { TEXT_INPUT } from '../formStyles';
import { sendAction } from '../../services/actions';
import { isCalendarDate, todayCalendarDate } from '../../utils/dates';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';

/**
 * New tournament: a name and the first day, and nothing else (U45). A tournament is not built in
 * one sitting — the name and the date are known months ahead and everything else lands over the
 * following weeks — so the tournament's own page is the form for the rest. `Festival` is the format
 * that assumes least; the server creates the first division and its stages from it (U16).
 *
 * Saving opens the new tournament's page. A refusal is already said by `sendAction`, and the dialog
 * stays open with what was typed.
 */
export function NewTournamentDialog({ visible, orgId, onClose, onCreated }: {
  visible: boolean;
  orgId: string;
  onClose: () => void;
  onCreated: (eventId: string) => void;
}) {
  const isDark = useActiveTheme() === 'dark';
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName('');
    setStartDate(todayCalendarDate());
  }, [visible]);

  const canSave = !!name.trim() && isCalendarDate(startDate);

  const save = async () => {
    if (!canSave) return;
    setIsSaving(true);
    const result = await sendAction(SocketAction.ADD_EVENT, {
      name: name.trim(),
      type: 'Tournament',
      format: 'Festival',
      startDate,
      orgId,
      status: 'Scheduled',
    });
    setIsSaving(false);
    if (!result.ok) return;
    onCreated(result.data.id);
  };

  return (
    <EditDialog
      visible={visible}
      title="New tournament"
      onClose={onClose}
      onSave={save}
      saveLabel="Create tournament"
      saveDisabled={!canSave}
      isSaving={isSaving}
      isDirty={!!name.trim()}
    >
      <View className="gap-1.5">
        <FieldLabel label="Name" />
        <TextInput
          value={name}
          onChangeText={setName}
          autoFocus
          placeholder="e.g. Winter Sevens 2026"
          placeholderTextColor={themeColor(isDark, 'ink-muted')}
          accessibilityLabel="Name"
          className={TEXT_INPUT}
        />
      </View>
      <View className="gap-1.5">
        <FieldLabel label="First day" />
        <View style={{ maxWidth: 220 }}>
          <DatePicker value={startDate} onChange={setStartDate} />
        </View>
      </View>
      <Text className="font-inter text-xs text-ink-muted leading-relaxed">
        Sports, divisions, venues and teams are set up on the tournament, in whatever order they are settled.
      </Text>
    </EditDialog>
  );
}

/** The ways the list can be narrowed behind its Filters button (docs/events.md). */
export type EventKindFilter = 'all' | 'matches' | 'tournaments';
export type EventListRole = 'hosting' | 'convening' | 'away';

export interface EventListFilters {
  sportIds: string[];
  kind: EventKindFilter;
  roles: EventListRole[];
}

export const NO_FILTERS: EventListFilters = { sportIds: [], kind: 'all', roles: [] };

export const ROLE_OPTIONS: Array<{ key: EventListRole; label: string; description: string }> = [
  { key: 'hosting', label: 'Hosting', description: 'Your organisation runs it' },
  { key: 'convening', label: 'Convening', description: 'You run part of it: a sport or a division' },
  { key: 'away', label: 'Away', description: "Your teams are playing at another organisation's event" },
];

/**
 * The Filters panel — centred on a wide screen, a bottom sheet on a phone. Choices apply to the list
 * as they are made; the button at the bottom only closes it, saying how many are left to see.
 *
 * On a phone it starts with When (Upcoming / Past), which has no room in the toolbar there: Mine /
 * All takes that place, being the switch that most changes what someone sees.
 */
export function EventFiltersDialog({
  visible, onClose, filters, onChange, sportOptions, roleCounts, showKind, when, onWhenChange, shownLabel,
}: {
  visible: boolean;
  onClose: () => void;
  filters: EventListFilters;
  onChange: (next: EventListFilters) => void;
  /** Only the sports in the list, with how many each has. Left out when there is just one. */
  sportOptions: Array<{ id: string; name: string; count: number }>;
  roleCounts: Record<EventListRole, number>;
  /** Matches or tournaments — offered in the Events view only. */
  showKind: boolean;
  /** Set on a phone, where When lives here rather than in the toolbar. */
  when?: 'upcoming' | 'past';
  onWhenChange?: (when: 'upcoming' | 'past') => void;
  /** "Show 5 events". */
  shownLabel: string;
}) {
  const isDark = useActiveTheme() === 'dark';
  const any = filters.sportIds.length > 0 || filters.kind !== 'all' || filters.roles.length > 0 || when === 'past';

  const toggleSport = (id: string) => onChange({
    ...filters,
    sportIds: filters.sportIds.includes(id) ? filters.sportIds.filter(s => s !== id) : [...filters.sportIds, id],
  });
  const toggleRole = (role: EventListRole) => onChange({
    ...filters,
    roles: filters.roles.includes(role) ? filters.roles.filter(r => r !== role) : [...filters.roles, role],
  });
  const clearAll = () => {
    onChange(NO_FILTERS);
    if (when === 'past') onWhenChange?.('upcoming');
  };

  const section = (label: string, body: React.ReactNode) => (
    <View className="gap-2">
      <Text className="font-inter-bold text-xs text-ink-muted uppercase tracking-wider">{label}</Text>
      {body}
    </View>
  );

  return (
    <EditDialog
      visible={visible}
      title="Filters"
      onClose={onClose}
      doneLabel={shownLabel}
      footerLeft={any ? (
        <TouchableOpacity onPress={clearAll} accessibilityRole="button" className="py-2">
          <Text className="font-inter-bold text-sm text-ink-muted">Clear all</Text>
        </TouchableOpacity>
      ) : undefined}
    >
      {when && onWhenChange ? section('When', (
        <View className="self-start">
          <SegmentedControl
            fit
            value={when}
            onChange={onWhenChange}
            options={[{ key: 'upcoming', label: 'Upcoming' }, { key: 'past', label: 'Past' }]}
          />
        </View>
      )) : null}

      {sportOptions.length > 1 ? section('Sport', (
        <View className="flex-row flex-wrap gap-2">
          {sportOptions.map(sport => {
            const on = filters.sportIds.includes(sport.id);
            return (
              <TouchableOpacity
                key={sport.id}
                onPress={() => toggleSport(sport.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                className={`flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 ${on ? 'bg-raised border-line-selected' : 'border-line'}`}
              >
                {on ? <Ionicons name="checkmark" size={14} color={themeColor(isDark, 'ink')} /> : null}
                <Text className={`text-sm ${on ? 'font-inter-semibold text-ink' : 'font-inter text-ink-soft'}`}>{sport.name}</Text>
                <Text className="font-inter text-xs text-ink-muted">{sport.count}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )) : null}

      {showKind ? section('Kind', (
        <View className="self-start">
          <SegmentedControl
            fit
            value={filters.kind}
            onChange={kind => onChange({ ...filters, kind })}
            options={[
              { key: 'all', label: 'All' },
              { key: 'matches', label: 'Matches' },
              { key: 'tournaments', label: 'Tournaments' },
            ]}
          />
        </View>
      )) : null}

      {section('Role', (
        <View className="gap-1">
          {ROLE_OPTIONS.map(role => {
            const on = filters.roles.includes(role.key);
            return (
              <TouchableOpacity
                key={role.key}
                onPress={() => toggleRole(role.key)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                className="flex-row items-start gap-3 py-1.5"
              >
                <View className={`w-5 h-5 mt-0.5 rounded-md border items-center justify-center ${on ? 'bg-primary border-primary' : 'border-line-strong'}`}>
                  {on ? <Ionicons name="checkmark" size={14} color={themeColor(isDark, 'on-primary')} /> : null}
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="font-inter text-sm text-ink">{role.label}</Text>
                  <Text className="font-inter text-xs text-ink-muted">{role.description}</Text>
                </View>
                <Text className="font-inter text-xs text-ink-muted">{roleCounts[role.key]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </EditDialog>
  );
}
