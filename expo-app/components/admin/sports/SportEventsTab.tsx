import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ActionStepType, EventSection, EventTemplate } from '@sk/shared';
import { GlassCard } from '../../GlassCard';
import { EventTemplateEditor, SavedTemplateIds } from './EventTemplateEditor';
import { SportSectionsCard } from './SportSectionsCard';
import { AddButton, EmptyHint, SectionLabel, slugify } from './editorPrimitives';

/**
 * The Events tab: every event template on the sport, grouped by the scoring panel it lands on.
 *
 * The list is deliberately thin — one row per event with the facts that decide whether you have
 * the right one (points, how many steps, what it triggers). Everything else is behind the row,
 * in {@link EventTemplateEditor}.
 */

interface SportEventsTabProps {
  sections: EventSection[];
  onSectionsChange: (sections: EventSection[]) => void;
  templates: EventTemplate[];
  onChange: (templates: EventTemplate[]) => void;
  /** The templates as last saved, so ids that events already reference can be locked. */
  savedTemplates: EventTemplate[];
  /** Section ids as last saved, for the same reason. */
  savedSectionIds: Set<string>;
}

/** A blank template in the given section, ready to be filled in. */
const newTemplate = (sectionId: string): EventTemplate => ({
  id: '',
  name: '',
  section: sectionId,
  displayPattern: '{name}',
  steps: [{ type: ActionStepType.PLAYER_SELECTION }],
});

export function SportEventsTab({
  sections,
  onSectionsChange,
  templates,
  onChange,
  savedTemplates,
  savedSectionIds,
}: SportEventsTabProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const savedById = useMemo(() => {
    const map = new Map<string, EventTemplate>();
    for (const template of savedTemplates) map.set(template.id, template);
    return map;
  }, [savedTemplates]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Array<{ template: EventTemplate; index: number }>>();
    templates.forEach((template, index) => {
      const key = template.section || '';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({ template, index });
    });

    // Declared sections first, in panel order, then anything left behind by a section that was
    // renamed or removed — those are shown so they can be re-filed rather than silently hidden.
    const declared = sections.map((section) => ({
      section,
      items: groups.get(section.id) || [],
    }));
    const orphanKeys = [...groups.keys()].filter((key) => !sections.some((section) => section.id === key));
    const orphans = orphanKeys.map((key) => ({
      section: { id: key, name: key ? `${key} (no such section)` : 'No section' } as EventSection,
      items: groups.get(key)!,
    }));

    return [...declared, ...orphans];
  }, [templates, sections]);

  /** Which ids on this template already exist in the saved sport and must not be renamed. */
  const savedIdsFor = (template: EventTemplate): SavedTemplateIds => {
    const saved = savedById.get(template.id);
    return {
      isSaved: !!saved,
      outcomes: new Set((saved?.outcomes || []).map((outcome) => outcome.id)),
      reasons: new Set(
        (saved?.reasons || []).flatMap((group) => (group.options || []).map((option) => option.id))
      ),
    };
  };

  const addTemplate = (sectionId: string) => {
    onChange([...templates, newTemplate(sectionId)]);
    setEditingIndex(templates.length);
  };

  const duplicateTemplate = (index: number) => {
    const copy = JSON.parse(JSON.stringify(templates[index])) as EventTemplate;
    copy.name = `${copy.name} Copy`;
    copy.id = slugify(copy.name);
    // A duplicate keeps the original's outcomes and reasons, and those ids are unique per
    // template rather than per sport, so they can travel with it unchanged.
    onChange([...templates.slice(0, index + 1), copy, ...templates.slice(index + 1)]);
    setEditingIndex(index + 1);
  };

  const removeTemplate = (index: number) => {
    const template = templates[index];

    // Deleting an event that another one spawns would leave a trigger pointing at nothing —
    // which the server rejects on save, so say so here rather than at the end.
    const referencedBy = templates.filter((candidate, idx) => {
      if (idx === index) return false;
      if (candidate.triggerEventId === template.id) return true;
      return (candidate.outcomes || []).some((outcome) => outcome.triggerEventId === template.id);
    });

    const warnings: string[] = [];
    if (referencedBy.length > 0) {
      warnings.push(
        `${referencedBy.map((t) => t.name || t.id).join(', ')} trigger${referencedBy.length === 1 ? 's' : ''} this event. Clear that first or the save will be rejected.`
      );
    }
    if (savedById.has(template.id)) {
      warnings.push('Events already recorded under this id stay in the game feed, but will no longer resolve their name.');
    }

    Alert.alert(
      `Delete "${template.name || template.id}"?`,
      warnings.length > 0 ? warnings.join('\n\n') : 'This removes the event from the sport.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onChange(templates.filter((_, idx) => idx !== index)),
        },
      ]
    );
  };

  const describe = (template: EventTemplate): string => {
    const parts: string[] = [];
    const stepCount = (template.steps || []).reduce(
      (total, step) => total + (step.type === ActionStepType.GROUP ? (step.steps || []).length : 1),
      0
    );
    parts.push(`${stepCount} step${stepCount === 1 ? '' : 's'}`);
    if ((template.outcomes || []).length > 0) parts.push(`${template.outcomes!.length} outcomes`);
    const reasonCount = (template.reasons || []).reduce((total, group) => total + (group.options || []).length, 0);
    if (reasonCount > 0) parts.push(`${reasonCount} reasons`);
    if (template.triggerEventId) parts.push(`triggers ${template.triggerEventId}`);
    return parts.join(' · ');
  };

  return (
    <View>
      <SportSectionsCard
        sections={sections}
        onChange={onSectionsChange}
        templates={templates}
        savedSectionIds={savedSectionIds}
      />

      <SectionLabel className="mb-3">Event Templates</SectionLabel>

      <Text className="font-inter text-[11px] text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
        What a scorer can record for this sport, and what the app asks them for each time. A sport
        with no events can be rostered and scheduled, but not scored.
      </Text>

      {sections.length === 0 ? (
        <GlassCard className="border border-slate-200 dark:border-white/5 p-4 rounded-xl">
          <EmptyHint icon="flash-outline" text="Add a section above before adding events." />
        </GlassCard>
      ) : (
        <View className="space-y-5">
          {grouped.map(({ section, items }) => (
            <View key={section.id || 'unfiled'}>
              <View className="flex-row items-center justify-between mb-2">
                <Text className="font-inter-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  {section.name}
                </Text>
                <AddButton label="Add Event" onPress={() => addTemplate(section.id)} />
              </View>
              {items.length === 0 && (
                <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 italic mb-2">
                  No events in this section yet.
                </Text>
              )}
              <View className="space-y-2">
                {items.map(({ template, index }) => (
                  <GlassCard
                    key={`${template.id || 'new'}-${index}`}
                    className="border border-slate-200 dark:border-white/5 p-3 rounded-xl flex-row items-center gap-3"
                  >
                    <TouchableOpacity
                      onPress={() => setEditingIndex(index)}
                      className="flex-1 active:opacity-80"
                    >
                      <View className="flex-row items-center gap-2">
                        <Text className="font-inter-bold text-sm text-slate-800 dark:text-white" numberOfLines={1}>
                          {template.name || 'Untitled event'}
                        </Text>
                        {template.points !== undefined && (
                          <View className="bg-brand-orange/10 border border-brand-orange/30 px-1.5 py-0.5 rounded">
                            <Text className="font-orbitron-bold text-[8px] text-brand-orange">{template.points} PTS</Text>
                          </View>
                        )}
                        {!template.id && (
                          <View className="bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded">
                            <Text className="font-orbitron-bold text-[8px] text-amber-500">INCOMPLETE</Text>
                          </View>
                        )}
                      </View>
                      <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 mt-1" numberOfLines={1}>
                        {template.id ? `${template.id} · ` : ''}
                        {describe(template)}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => duplicateTemplate(index)}
                      className="p-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-lg active:opacity-80"
                    >
                      <Ionicons name="copy-outline" size={13} color="#94A3B8" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setEditingIndex(index)}
                      className="p-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-lg active:opacity-80"
                    >
                      <Ionicons name="create-outline" size={13} color="#FF3E00" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => removeTemplate(index)}
                      className="p-2 bg-red-500/10 dark:bg-red-500/5 border border-red-500/20 rounded-lg active:opacity-80"
                    >
                      <Ionicons name="trash" size={13} color="#EF4444" />
                    </TouchableOpacity>
                  </GlassCard>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}

      {editingIndex !== null && templates[editingIndex] && (
        <EventTemplateEditor
          template={templates[editingIndex]}
          sections={sections}
          allTemplates={templates}
          savedIds={savedIdsFor(templates[editingIndex])}
          onCancel={() => setEditingIndex(null)}
          onDone={(next) => {
            onChange(templates.map((template, idx) => (idx === editingIndex ? next : template)));
            setEditingIndex(null);
          }}
        />
      )}
    </View>
  );
}
