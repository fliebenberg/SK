import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../GlassCard';
import { SegmentedControl } from '../../SegmentedControl';
import { COLORS } from '../../../constants/Colors';
import { Field, NumberField, SectionLabel, TextField, ToggleField } from './editorPrimitives';
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
        {/*
          These two describe the sport truthfully, but the app has not caught up with them yet:
          the multi-competitor screens have not been designed. Saying so on the control is the
          point - a setting that silently does nothing is worse than no setting, because it looks
          like it took effect (`SPORT-10`). Each hint below names what reads it *today*, so the
          notice stops being a blanket disclaimer as consumers land.
        */}
        <View className="flex-row items-start gap-2 rounded-lg border border-brand-orange/25 bg-brand-orange/5 p-3">
          <Ionicons name="information-circle-outline" size={14} color={COLORS.brand.orange} />
          <Text className="flex-1 font-inter text-[10px] leading-4 text-slate-700 dark:text-slate-300">
            Set these to describe the sport correctly. Individual and multi-competitor formats are
            only partly built - fixture creation and the scoring screens still assume two sides -
            so each setting says below what already reads it.
          </Text>
        </View>

        <Field
          label="Participant Type"
          hint="Whether sides are teams with rosters, or single competitors. Stored and kept, but nothing reads it yet."
        >
          <SegmentedControl
            isCompact={false}
            value={form.participantType}
            onChange={(value) => setField('participantType', value as SportForm['participantType'])}
            options={[
              { key: 'TEAM', label: 'Team' },
              { key: 'INDIVIDUAL', label: 'Individual' },
            ]}
          />
        </Field>

        <Field
          label="Match Topology"
          hint="Two sides per fixture, or many competing at once. Standings honour this; fixture creation and the scoring screens still assume two sides."
        >
          <SegmentedControl
            isCompact={false}
            value={form.matchTopology}
            onChange={(value) => setField('matchTopology', value as SportForm['matchTopology'])}
            options={[
              { key: 'HEAD_TO_HEAD', label: 'Head to Head' },
              { key: 'MULTI_COMPETITOR', label: 'Multi Competitor' },
            ]}
          />
        </Field>

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
