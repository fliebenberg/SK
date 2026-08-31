import React from 'react';
import { View, Text } from 'react-native';
import { getEventSections } from '@sk/shared';
import { useSharedDynamicScoring } from './DynamicScoringContext';
import { DynamicScoringPanel } from './DynamicScoringPanel';

/**
 * Every scoring panel this sport declares, stacked in the order the sport lists its sections.
 *
 * This replaces four fixed slots in the control room — Scoring, Game Events, Infringements,
 * Stats — that were mounted by name through the component registry and had to be edited in three
 * files whenever a sport wanted a different set. Sections are editable per sport now, so the
 * screen renders whatever the sport declares and nothing here knows their names.
 *
 * A sport that needs a bespoke panel for one section can still be special-cased in the registry;
 * the generic path is what every sport gets for free.
 */
export function DynamicScoringPanels({ role }: { role?: string }) {
  const { sport } = useSharedDynamicScoring();
  const sections = getEventSections(sport);

  if (sections.length === 0) {
    return (
      <View className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl p-4 mb-1.5">
        <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 text-center leading-relaxed">
          {sport
            ? `${sport.name} has no event sections configured, so there is nothing to record. Add them in system admin under Sports.`
            : 'Loading sport configuration…'}
        </Text>
      </View>
    );
  }

  return (
    <>
      {sections.map((section) => (
        <DynamicScoringPanel key={section.id} section={section.id} role={role} />
      ))}
    </>
  );
}
