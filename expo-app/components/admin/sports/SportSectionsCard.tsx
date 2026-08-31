import React from 'react';
import { View, Text, Alert } from 'react-native';
import { EventSection, EventTemplate } from '@sk/shared';
import { GlassCard } from '../../GlassCard';
import {
  AddButton,
  Collapsible,
  EmptyHint,
  LockedIdField,
  RowActions,
  SectionLabel,
  TextField,
  ToggleField,
  slugify,
} from './editorPrimitives';

/**
 * The sections manager on the Events tab: the panels this sport's scoring screen stacks.
 *
 * Order here is the order the panels appear in the control room, and one section must be marked
 * as affecting the score or nothing a scorer records will move the scoreboard.
 */

interface SportSectionsCardProps {
  sections: EventSection[];
  onChange: (sections: EventSection[]) => void;
  /** Templates, to block deleting a section that still has events filed under it. */
  templates: EventTemplate[];
  /** Section ids that already exist on the saved sport, so their ids are fixed. */
  savedSectionIds: Set<string>;
}

export function SportSectionsCard({ sections, onChange, templates, savedSectionIds }: SportSectionsCardProps) {
  const update = (index: number, patch: Partial<EventSection>) =>
    onChange(sections.map((section, idx) => (idx === index ? { ...section, ...patch } : section)));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const setName = (index: number, name: string) => {
    const section = sections[index];
    // A new section's id follows its name until saved; a saved one never moves, because every
    // template in it references the id.
    const canFollow = !savedSectionIds.has(section.id) && (!section.id || section.id === slugify(section.name || ''));
    update(index, { name, id: canFollow ? slugify(name) : section.id });
  };

  const remove = (index: number) => {
    const section = sections[index];
    const filed = templates.filter((template) => template.section === section.id);

    if (filed.length > 0) {
      Alert.alert(
        'Section In Use',
        `${filed.length} event${filed.length === 1 ? '' : 's'} (${filed
          .map((template) => template.name || template.id)
          .join(', ')}) ${filed.length === 1 ? 'is' : 'are'} filed under "${section.name}". Move them to another section first.`
      );
      return;
    }

    onChange(sections.filter((_, idx) => idx !== index));
  };

  const addSection = () => onChange([...sections, { id: '', name: '' }]);

  const scoringCount = sections.filter((section) => section.affectsScore).length;

  return (
    <View className="mb-6">
      <View className="flex-row items-center justify-between mb-3">
        <SectionLabel>Event Sections</SectionLabel>
        <AddButton label="Add Section" onPress={addSection} />
      </View>

      <Text className="font-inter text-[11px] text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
        The panels the scoring control room stacks, in this order. Every event belongs to one.
      </Text>

      <GlassCard className="border border-slate-200 dark:border-white/5 p-4 rounded-xl">
        {sections.length === 0 ? (
          <EmptyHint icon="albums-outline" text="No sections yet. Add one before adding events." />
        ) : (
          <View className="space-y-2">
            {sections.map((section, index) => {
              const filed = templates.filter((template) => template.section === section.id).length;
              return (
                <Collapsible
                  key={index}
                  title={section.name || 'Untitled section'}
                  subtitle={section.id}
                  badge={`${filed} event${filed === 1 ? '' : 's'}`}
                  actions={
                    <RowActions
                      canMoveUp={index > 0}
                      canMoveDown={index < sections.length - 1}
                      onMoveUp={() => move(index, -1)}
                      onMoveDown={() => move(index, 1)}
                      onDelete={() => remove(index)}
                    />
                  }
                >
                  <TextField
                    label="Panel Heading"
                    small
                    value={section.name || ''}
                    onChangeText={(text) => setName(index, text)}
                    placeholder="e.g. Scoring Events"
                  />
                  {savedSectionIds.has(section.id) ? (
                    <LockedIdField
                      label="Section Id"
                      value={section.id}
                      hint="Fixed once saved — the events in this section reference it. The heading above is free to change."
                    />
                  ) : (
                    <TextField
                      label="Section Id"
                      small
                      value={section.id || ''}
                      onChangeText={(text) => update(index, { id: slugify(text) })}
                      placeholder="e.g. scoring"
                      autoCapitalize="none"
                    />
                  )}
                  <ToggleField
                    label="Affects The Score"
                    value={!!section.affectsScore}
                    onChange={(value) => update(index, { affectsScore: value || undefined })}
                    hint="Events here are recorded as scores, show as pending until their outcome is answered, and the panel offers the final-score override. An event worth points counts as scoring either way."
                  />
                </Collapsible>
              );
            })}
          </View>
        )}

        {sections.length > 0 && scoringCount === 0 && (
          <View className="mt-3 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10">
            <Text className="font-inter text-[10px] text-amber-600 dark:text-amber-400 leading-relaxed">
              No section affects the score. Events worth points will still count, but a scoring
              event worth zero points will not move the scoreboard.
            </Text>
          </View>
        )}
      </GlassCard>
    </View>
  );
}
