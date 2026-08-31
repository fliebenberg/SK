import React from 'react';
import { View, Text } from 'react-native';
import { GlassCard } from '../../GlassCard';
import { SegmentedControl } from '../../SegmentedControl';
import { NumberField, SectionLabel, TextField, ToggleField } from './editorPrimitives';
import { SportForm } from './sportForm';

/**
 * The Settings tab: what the sport is called, what it calls its facility and periods, and the
 * defaults every fixture of this sport starts from.
 */

interface SportSettingsTabProps {
  form: SportForm;
  setField: <K extends keyof SportForm>(field: K, value: SportForm[K]) => void;
  /** Card rules only mean something for a sport that has events to card with. */
  showCardSettings: boolean;
}

export function SportSettingsTab({ form, setField, showCardSettings }: SportSettingsTabProps) {
  return (
    <View>
      <SectionLabel className="mb-3">Sport General Details</SectionLabel>
      <GlassCard className="border border-slate-200 dark:border-white/5 p-4 rounded-xl space-y-4 mb-6">
        <TextField
          label="Sport Name"
          value={form.name}
          onChangeText={(text) => setField('name', text)}
          placeholder="e.g. Soccer, Netball"
        />
        <View className="flex-row gap-4">
          <TextField
            className="flex-1"
            label="Facility Term"
            value={form.facilityTerm}
            onChangeText={(text) => setField('facilityTerm', text)}
            placeholder="e.g. Field, Court"
          />
          <TextField
            className="flex-1"
            label="Period Term"
            value={form.periodTerm}
            onChangeText={(text) => setField('periodTerm', text)}
            placeholder="e.g. Half, Quarter"
          />
        </View>
      </GlassCard>

      <SectionLabel className="mb-3">System Rules & Configuration</SectionLabel>
      <GlassCard className="border border-slate-200 dark:border-white/5 p-4 rounded-xl space-y-4 mb-6">
        <View>
          <Text className="font-inter-bold text-xs text-slate-700 dark:text-slate-300 mb-1.5">Participant Type</Text>
          <SegmentedControl
            isCompact={false}
            value={form.participantType}
            onChange={(value) => setField('participantType', value as SportForm['participantType'])}
            options={[
              { key: 'TEAM', label: 'Team' },
              { key: 'INDIVIDUAL', label: 'Individual' },
            ]}
          />
          <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">
            Whether sides are teams with rosters, or single competitors.
          </Text>
        </View>

        <View>
          <Text className="font-inter-bold text-xs text-slate-700 dark:text-slate-300 mb-1.5">Match Topology</Text>
          <SegmentedControl
            isCompact={false}
            value={form.matchTopology}
            onChange={(value) => setField('matchTopology', value as SportForm['matchTopology'])}
            options={[
              { key: 'HEAD_TO_HEAD', label: 'Head to Head' },
              { key: 'MULTI_COMPETITOR', label: 'Multi Competitor' },
            ]}
          />
          <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">
            Two sides per fixture, or many competing at once.
          </Text>
        </View>

        <View className="flex-row gap-4">
          <NumberField
            className="flex-1"
            label="Scheduled Periods"
            value={form.scheduledPeriods}
            onChangeText={(text) => setField('scheduledPeriods', text)}
            placeholder="e.g. 2"
            integer
          />
          <NumberField
            className="flex-1"
            label="Period Length (minutes)"
            value={form.periodLengthMinutes}
            onChangeText={(text) => setField('periodLengthMinutes', text)}
            placeholder="e.g. 40"
          />
        </View>
        <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 -mt-2">
          Defaults for a new fixture. A game or event may override either, and a game already under
          way keeps the clock it started with.
        </Text>

        <NumberField
          label="Max Reserves"
          value={form.maxReserves}
          onChangeText={(text) => setField('maxReserves', text)}
          placeholder="e.g. 8"
          integer
          hint="Leave blank for unlimited."
        />

        {showCardSettings && (
          <>
            <NumberField
              label="Yellow Card Duration (minutes)"
              value={form.yellowCardMinutes}
              onChangeText={(text) => setField('yellowCardMinutes', text)}
              placeholder="e.g. 10"
            />
            <ToggleField
              label="Timed Red Cards Allowed"
              value={form.allowTimedRedCard}
              onChange={(value) => setField('allowTimedRedCard', value)}
              hint="With this off, a timed red is served as a permanent one."
            />
            {form.allowTimedRedCard && (
              <NumberField
                label="Red Card Duration (minutes)"
                value={form.redCardMinutes}
                onChangeText={(text) => setField('redCardMinutes', text)}
                placeholder="e.g. 20"
              />
            )}
          </>
        )}
      </GlassCard>
    </View>
  );
}
