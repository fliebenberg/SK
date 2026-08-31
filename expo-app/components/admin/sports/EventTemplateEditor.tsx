import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Modal, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ActionStep,
  ActionStepType,
  EventSection,
  EventTemplate,
  Outcome,
  ReasonGroup,
  TemplateDisputeType,
} from '@sk/shared';
import { GlassCard } from '../../GlassCard';
import { registeredWidgetNames } from '../../sports/shared/widgets';
import {
  AddButton,
  Collapsible,
  EmptyHint,
  JsonField,
  KeyValueEditor,
  LockedIdField,
  NumberField,
  RowActions,
  SectionLabel,
  SelectField,
  TextField,
  ToggleField,
  slugify,
} from './editorPrimitives';

/**
 * The editor for one event template — what the scoring dialog will ask, what the event can end
 * in, and what it is worth.
 *
 * It edits a **draft copy** and hands the finished template back on Done, so abandoning the
 * modal cannot leave a half-built event in the sport. The sport itself is still only written
 * when the screen's Save bar is used.
 *
 * The shape it edits is described on `EventTemplate` in the shared package. Two rules from
 * there drive most of the layout: `outcomes` and `reasons` belong to the template rather than
 * to the step that shows them — a step only says *where* the picker appears — and ids are the
 * stable reference stored on every recorded event, so they are locked once saved.
 */

const STEP_TYPE_OPTIONS = [
  { value: ActionStepType.PLAYER_SELECTION, label: 'Player Selection' },
  { value: ActionStepType.REASON_SELECTION, label: 'Reason Selection' },
  { value: ActionStepType.OUTCOME_SELECTION, label: 'Outcome Selection' },
  { value: ActionStepType.CUSTOM_WIDGET, label: 'Custom Widget' },
  { value: ActionStepType.FORM_INPUT, label: 'Form Input' },
  { value: ActionStepType.GROUP, label: 'Group (one screen)' },
];

const VARIANT_OPTIONS = [
  { value: '', label: 'Default' },
  { value: 'success', label: 'Success (green)' },
  { value: 'danger', label: 'Danger (red)' },
  { value: 'warning', label: 'Warning (amber)' },
];

const STEP_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  STEP_TYPE_OPTIONS.map((option) => [option.value, option.label])
);

/** Which ids already exist in the saved sport, and so may not be renamed. */
export interface SavedTemplateIds {
  isSaved: boolean;
  outcomes: Set<string>;
  reasons: Set<string>;
}

interface EventTemplateEditorProps {
  template: EventTemplate;
  /** The sport's sections — the panels this event can be filed under. */
  sections: EventSection[];
  /** Every template on the sport, for the trigger pickers. Includes the one being edited. */
  allTemplates: EventTemplate[];
  savedIds: SavedTemplateIds;
  onDone: (template: EventTemplate) => void;
  onCancel: () => void;
}

export function EventTemplateEditor({
  template,
  sections,
  allTemplates,
  savedIds,
  onDone,
  onCancel,
}: EventTemplateEditorProps) {
  const [draft, setDraft] = useState<EventTemplate>(() => JSON.parse(JSON.stringify(template)));
  /** JSON boxes that currently hold unparseable text, by field key. */
  const [invalidJson, setInvalidJson] = useState<Record<string, boolean>>({});

  const patch = (changes: Partial<EventTemplate>) => setDraft((prev) => ({ ...prev, ...changes }));

  const setJsonValidity = (key: string, isValid: boolean) =>
    setInvalidJson((prev) => ({ ...prev, [key]: !isValid }));

  const triggerOptions = useMemo(
    () => [
      { value: '', label: 'None' },
      ...allTemplates
        .filter((candidate) => candidate.id && candidate.id !== draft.id)
        .map((candidate) => ({ value: candidate.id, label: `${candidate.name} (${candidate.id})` })),
    ],
    [allTemplates, draft.id]
  );

  const widgetOptions = useMemo(
    () => registeredWidgetNames().map((name) => ({ value: name, label: name })),
    []
  );

  const sectionOptions = useMemo(
    () => sections.map((section) => ({ value: section.id, label: section.name || section.id })),
    [sections]
  );

  // --- Name/id syncing -------------------------------------------------------------------
  // A new entity's id follows its name until the id is edited by hand; a saved one never moves.
  const idFollowsName = (id: string | undefined, name: string | undefined, isSavedId: boolean) =>
    !isSavedId && (!id || id === slugify(name || ''));

  const setName = (name: string) => {
    const nextId = idFollowsName(draft.id, draft.name, savedIds.isSaved) ? slugify(name) : draft.id;
    patch({ name, id: nextId });
  };

  // --- Steps -----------------------------------------------------------------------------
  const steps = draft.steps || [];

  const writeSteps = (next: ActionStep[]) => patch({ steps: next });

  const updateStep = (index: number, changes: Partial<ActionStep>, path?: number) => {
    const next = steps.map((step, idx) => {
      if (idx !== index) return step;
      if (path === undefined) return { ...step, ...changes };
      const children = (step.steps || []).map((child, childIdx) =>
        childIdx === path ? { ...child, ...changes } : child
      );
      return { ...step, steps: children };
    });
    writeSteps(next);
  };

  const moveItem = <T,>(list: T[], index: number, delta: number): T[] => {
    const target = index + delta;
    if (target < 0 || target >= list.length) return list;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  };

  const addStep = () => writeSteps([...steps, { type: ActionStepType.PLAYER_SELECTION }]);

  const addChildStep = (index: number) => {
    const next = steps.map((step, idx) =>
      idx === index ? { ...step, steps: [...(step.steps || []), { type: ActionStepType.PLAYER_SELECTION }] } : step
    );
    writeSteps(next);
  };

  const updateGroupChildren = (index: number, children: ActionStep[]) => {
    writeSteps(steps.map((step, idx) => (idx === index ? { ...step, steps: children } : step)));
  };

  const renderStepBody = (step: ActionStep, index: number, childIndex?: number) => {
    const isChild = childIndex !== undefined;
    const apply = (changes: Partial<ActionStep>) => updateStep(index, changes, childIndex);
    const isSelection =
      step.type === ActionStepType.PLAYER_SELECTION ||
      step.type === ActionStepType.REASON_SELECTION ||
      step.type === ActionStepType.OUTCOME_SELECTION;

    return (
      <View className="space-y-3">
        <SelectField
          label="Step Type"
          value={step.type}
          onChange={(value) => apply({ type: value as ActionStepType })}
          options={isChild ? STEP_TYPE_OPTIONS.filter((o) => o.value !== ActionStepType.GROUP) : STEP_TYPE_OPTIONS}
        />
        <TextField
          label="Label"
          small
          value={step.name || ''}
          onChangeText={(text) => apply({ name: text || undefined })}
          placeholder={step.type === ActionStepType.GROUP ? 'e.g. Scrum Detail' : 'Optional heading for this screen'}
        />

        {isSelection && (
          <ToggleField
            label="Required"
            value={!!step.required}
            onChange={(value) => apply({ required: value || undefined })}
            hint="Required steps block the save until answered. Unanswered optional steps are flagged as missing detail either way."
          />
        )}

        {step.type === ActionStepType.CUSTOM_WIDGET && (
          <>
            <SelectField
              label="Widget"
              value={step.widgetName || ''}
              onChange={(value) => apply({ widgetName: value || undefined })}
              options={widgetOptions}
              placeholder="Choose a registered widget"
              hint="Widgets are registered in the app's widget registry; a name that is not listed renders an error at match time."
            />
            <TextField
              label="Data Key"
              small
              value={step.dataKey || ''}
              onChangeText={(text) => apply({ dataKey: text || undefined })}
              placeholder="e.g. scrumResets"
              autoCapitalize="none"
              hint="The eventData field this widget's value is stored under."
            />
          </>
        )}

        {step.type === ActionStepType.FORM_INPUT && (
          <JsonField
            label="Fields (JSON)"
            value={step.fields}
            onChange={(parsed, isValid) => {
              setJsonValidity(`step-${index}-${childIndex ?? 'x'}`, isValid);
              if (isValid) apply({ fields: parsed });
            }}
            placeholder='[{ "name": "distance", "type": "number", "label": "Distance" }]'
            hint="Form inputs have no fixed shape yet, so their fields are authored as JSON."
          />
        )}

        {step.type === ActionStepType.GROUP && !isChild && (
          <View>
            <View className="flex-row items-center justify-between mb-2">
              <Text className="font-inter-bold text-xs text-slate-700 dark:text-slate-300">
                Steps In This Group
              </Text>
              <AddButton label="Add Step" onPress={() => addChildStep(index)} />
            </View>
            {(step.steps || []).length === 0 ? (
              <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 italic">
                An empty group is dropped from the flow.
              </Text>
            ) : (
              <View className="space-y-2">
                {(step.steps || []).map((child, childIdx) => (
                  <Collapsible
                    key={childIdx}
                    title={STEP_TYPE_LABELS[child.type] || child.type}
                    subtitle={child.name}
                    actions={
                      <RowActions
                        canMoveUp={childIdx > 0}
                        canMoveDown={childIdx < (step.steps || []).length - 1}
                        onMoveUp={() => updateGroupChildren(index, moveItem(step.steps || [], childIdx, -1))}
                        onMoveDown={() => updateGroupChildren(index, moveItem(step.steps || [], childIdx, 1))}
                        onDelete={() =>
                          updateGroupChildren(
                            index,
                            (step.steps || []).filter((_, idx) => idx !== childIdx)
                          )
                        }
                      />
                    }
                  >
                    {renderStepBody(child, index, childIdx)}
                  </Collapsible>
                ))}
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  // --- Outcomes --------------------------------------------------------------------------
  const outcomes = draft.outcomes || [];

  const writeOutcomes = (next: Outcome[]) => patch({ outcomes: next.length === 0 ? undefined : next });

  const updateOutcome = (index: number, changes: Partial<Outcome>) =>
    writeOutcomes(outcomes.map((outcome, idx) => (idx === index ? { ...outcome, ...changes } : outcome)));

  const setOutcomeName = (index: number, name: string) => {
    const outcome = outcomes[index];
    const isSavedId = savedIds.outcomes.has(outcome.id);
    const nextId = idFollowsName(outcome.id, outcome.name, isSavedId) ? slugify(name) : outcome.id;
    updateOutcome(index, { name, id: nextId });
  };

  // --- Reasons ---------------------------------------------------------------------------
  const reasonGroups = draft.reasons || [];

  const writeReasons = (next: ReasonGroup[]) => patch({ reasons: next.length === 0 ? undefined : next });

  const updateGroup = (groupIndex: number, changes: Partial<ReasonGroup>) =>
    writeReasons(reasonGroups.map((group, idx) => (idx === groupIndex ? { ...group, ...changes } : group)));

  const updateOption = (groupIndex: number, optionIndex: number, changes: any) => {
    const group = reasonGroups[groupIndex];
    const options = group.options.map((option, idx) => (idx === optionIndex ? { ...option, ...changes } : option));
    updateGroup(groupIndex, { options });
  };

  const setOptionName = (groupIndex: number, optionIndex: number, name: string) => {
    const option = reasonGroups[groupIndex].options[optionIndex];
    const isSavedId = savedIds.reasons.has(option.id);
    const nextId = idFollowsName(option.id, option.name, isSavedId) ? slugify(name) : option.id;
    updateOption(groupIndex, optionIndex, { name, id: nextId });
  };

  // --- Dispute config --------------------------------------------------------------------
  const dispute = draft.disputeConfig;

  const patchDispute = (changes: any) => {
    patch({ disputeConfig: { ...(dispute || { type: TemplateDisputeType.REMOVE }), ...changes } });
  };

  // --- Done ------------------------------------------------------------------------------
  const handleDone = () => {
    if (Object.values(invalidJson).some(Boolean)) {
      Alert.alert('Invalid JSON', 'One of the JSON fields on this event cannot be parsed. Fix it before continuing.');
      return;
    }
    if (!draft.name.trim()) {
      Alert.alert('Missing Name', 'This event needs a name.');
      return;
    }
    if (!draft.id.trim()) {
      Alert.alert('Missing Id', 'This event needs an id.');
      return;
    }
    if (!sections.some((section) => section.id === draft.section)) {
      Alert.alert('No Section', 'Choose the section this event belongs to.');
      return;
    }
    if ((draft.steps || []).length === 0) {
      Alert.alert('No Steps', 'An event with no steps cannot be scored. Add at least one step.');
      return;
    }

    const hasOutcomeStep = (draft.steps || []).some(
      (step) =>
        step.type === ActionStepType.OUTCOME_SELECTION ||
        (step.steps || []).some((child) => child.type === ActionStepType.OUTCOME_SELECTION)
    );
    if (outcomes.length > 0 && !hasOutcomeStep) {
      Alert.alert(
        'Outcomes Are Unreachable',
        'This event defines outcomes but has no Outcome Selection step, so the scorer will never be asked to choose one. Add the step, or remove the outcomes.'
      );
      return;
    }

    const hasReasonStep = (draft.steps || []).some(
      (step) =>
        step.type === ActionStepType.REASON_SELECTION ||
        (step.steps || []).some((child) => child.type === ActionStepType.REASON_SELECTION)
    );
    if (reasonGroups.length > 0 && !hasReasonStep) {
      Alert.alert(
        'Reasons Are Unreachable',
        'This event defines reasons but has no Reason Selection step, so the scorer will never be asked to choose one. Add the step, or remove the reasons.'
      );
      return;
    }

    onDone({ ...draft, id: draft.id.trim(), name: draft.name.trim() });
  };

  return (
    <Modal visible animationType="slide" transparent={false} onRequestClose={onCancel}>
      <View className="flex-1 bg-slate-50 dark:bg-slate-950">
        {/* HEADER */}
        <View className="flex-row items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/5 bg-white dark:bg-slate-900">
          <TouchableOpacity onPress={onCancel} className="flex-row items-center gap-1.5 active:opacity-80">
            <Ionicons name="close" size={18} color="#94A3B8" />
            <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-0.5">
              Cancel
            </Text>
          </TouchableOpacity>
          <Text className="font-orbitron-bold text-xs text-slate-800 dark:text-white uppercase tracking-wider" numberOfLines={1}>
            {savedIds.isSaved ? 'Edit Event' : 'New Event'}
          </Text>
          <TouchableOpacity
            onPress={handleDone}
            className="bg-brand-orange px-4 py-2 rounded-xl flex-row items-center gap-1.5 active:scale-95"
          >
            <Ionicons name="checkmark" size={14} color="white" />
            <Text className="font-orbitron-bold text-[9px] text-white uppercase tracking-widest mt-0.5">Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView className="flex-1 px-5 py-5" contentContainerStyle={{ paddingBottom: 60 }}>
          <Text className="font-inter text-[11px] text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
            Changes here are held until you save the sport.
          </Text>

          {/* BASICS */}
          <SectionLabel className="mb-3">Event Basics</SectionLabel>
          <GlassCard className="border border-slate-200 dark:border-white/5 p-4 rounded-xl space-y-4 mb-6">
            <TextField label="Name" value={draft.name || ''} onChangeText={setName} placeholder="e.g. Penalty Try" />

            {savedIds.isSaved ? (
              <LockedIdField label="Event Id" value={draft.id} />
            ) : (
              <TextField
                label="Event Id"
                value={draft.id || ''}
                onChangeText={(text) => patch({ id: slugify(text) })}
                placeholder="e.g. penalty_try"
                autoCapitalize="none"
                hint="Follows the name until you edit it, and locks once the sport is saved."
              />
            )}

            <SelectField
              label="Section"
              value={draft.section || ''}
              onChange={(value) => patch({ section: value })}
              options={sectionOptions}
              placeholder="Choose a section"
              hint="Which scoring panel the button appears on. Sections are managed on the Events tab."
            />

            <View className="flex-row gap-4">
              <NumberField
                className="flex-1"
                label="Points"
                value={draft.points === undefined ? '' : String(draft.points)}
                onChangeText={(text) => patch({ points: text === '' ? undefined : Number(text) })}
                placeholder="0"
                integer
              />
              <TextField
                className="flex-1"
                label="Mobile Label"
                value={draft.mobileLabel || ''}
                onChangeText={(text) => patch({ mobileLabel: text || undefined })}
                placeholder="Short button text"
              />
            </View>

            <TextField
              label="Display Pattern"
              value={draft.displayPattern || ''}
              onChangeText={(text) => patch({ displayPattern: text || undefined })}
              placeholder="{name} → {outcome}"
              autoCapitalize="none"
              hint="How the event reads in the feed. {name}, {outcome} and {reason} are substituted."
            />

            <TextField
              label="Pending Outcome Label"
              value={draft.pendingOutcomeLabel || ''}
              onChangeText={(text) => patch({ pendingOutcomeLabel: text || undefined })}
              placeholder="e.g. Awaiting Kick"
              hint="Shown while a triggered follow-up has not been answered yet."
            />

            <TextField
              label="Icon"
              value={draft.icon || ''}
              onChangeText={(text) => patch({ icon: text || undefined })}
              placeholder="e.g. Zap"
              autoCapitalize="none"
              hint="Icon name from the sport spec. Not currently drawn by the mobile scoring panel."
            />
          </GlassCard>

          {/* STEPS */}
          <View className="flex-row items-center justify-between mb-3">
            <SectionLabel>Capture Flow</SectionLabel>
            <AddButton label="Add Step" onPress={addStep} />
          </View>
          <GlassCard className="border border-slate-200 dark:border-white/5 p-4 rounded-xl mb-6">
            <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 mb-3 leading-relaxed">
              One screen per step, in this order. A group renders its steps together on a single screen.
            </Text>
            {steps.length === 0 ? (
              <EmptyHint icon="layers-outline" text="No steps yet — the scorer would have nothing to answer." />
            ) : (
              <View className="space-y-2">
                {steps.map((step, index) => (
                  <Collapsible
                    key={index}
                    title={`${index + 1}. ${STEP_TYPE_LABELS[step.type] || step.type}`}
                    subtitle={step.name}
                    badge={step.type === ActionStepType.GROUP ? `${(step.steps || []).length} steps` : undefined}
                    actions={
                      <RowActions
                        canMoveUp={index > 0}
                        canMoveDown={index < steps.length - 1}
                        onMoveUp={() => writeSteps(moveItem(steps, index, -1))}
                        onMoveDown={() => writeSteps(moveItem(steps, index, 1))}
                        onDelete={() => writeSteps(steps.filter((_, idx) => idx !== index))}
                      />
                    }
                  >
                    {renderStepBody(step, index)}
                  </Collapsible>
                ))}
              </View>
            )}
          </GlassCard>

          {/* OUTCOMES */}
          <View className="flex-row items-center justify-between mb-3">
            <SectionLabel>Outcomes</SectionLabel>
            <AddButton label="Add Outcome" onPress={() => writeOutcomes([...outcomes, { id: '', name: '' }])} />
          </View>
          <GlassCard className="border border-slate-200 dark:border-white/5 p-4 rounded-xl mb-6">
            <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 mb-3 leading-relaxed">
              What the event can end in, and what each ending is worth. The server reads points and
              follow-ups from here.
            </Text>
            {outcomes.length === 0 ? (
              <EmptyHint icon="git-branch-outline" text="No outcomes — the event is recorded as soon as its steps are answered." />
            ) : (
              <View className="space-y-2">
                {outcomes.map((outcome, index) => (
                  <Collapsible
                    key={index}
                    title={outcome.name || 'Untitled outcome'}
                    subtitle={outcome.id}
                    badge={outcome.points !== undefined ? `${outcome.points} pts` : undefined}
                    actions={
                      <RowActions
                        canMoveUp={index > 0}
                        canMoveDown={index < outcomes.length - 1}
                        onMoveUp={() => writeOutcomes(moveItem(outcomes, index, -1))}
                        onMoveDown={() => writeOutcomes(moveItem(outcomes, index, 1))}
                        onDelete={() => writeOutcomes(outcomes.filter((_, idx) => idx !== index))}
                      />
                    }
                  >
                    <TextField
                      label="Name"
                      small
                      value={outcome.name || ''}
                      onChangeText={(text) => setOutcomeName(index, text)}
                      placeholder="e.g. Successful"
                    />
                    {savedIds.outcomes.has(outcome.id) ? (
                      <LockedIdField label="Outcome Id" value={outcome.id} />
                    ) : (
                      <TextField
                        label="Outcome Id"
                        small
                        value={outcome.id || ''}
                        onChangeText={(text) => updateOutcome(index, { id: slugify(text) })}
                        placeholder="e.g. successful"
                        autoCapitalize="none"
                      />
                    )}
                    <View className="flex-row gap-3">
                      <NumberField
                        className="flex-1"
                        small
                        label="Points"
                        value={outcome.points === undefined ? '' : String(outcome.points)}
                        onChangeText={(text) => updateOutcome(index, { points: text === '' ? undefined : Number(text) })}
                        placeholder="0"
                        integer
                      />
                      <TextField
                        className="flex-1"
                        small
                        label="Feed Override"
                        value={outcome.displayOverride ?? ''}
                        onChangeText={(text) => updateOutcome(index, { displayOverride: text || undefined })}
                        placeholder="Short text"
                      />
                    </View>
                    <SelectField
                      label="Colour"
                      value={outcome.variant || ''}
                      onChange={(value) => updateOutcome(index, { variant: value || undefined })}
                      options={VARIANT_OPTIONS}
                    />
                    <SelectField
                      label="Triggers Event"
                      value={outcome.triggerEventId || ''}
                      onChange={(value) => updateOutcome(index, { triggerEventId: value || undefined })}
                      options={triggerOptions}
                      hint="A follow-up event opened once this outcome is chosen."
                    />
                    {!!outcome.triggerEventId && (
                      <>
                        <SelectField
                          label="Follow-up Belongs To"
                          value={outcome.triggerTeam || 'same'}
                          onChange={(value) => updateOutcome(index, { triggerTeam: value as any })}
                          options={[
                            { value: 'same', label: 'Same team' },
                            { value: 'opponent', label: 'Opposing team' },
                          ]}
                        />
                        <KeyValueEditor
                          label="Follow-up Starts With"
                          value={outcome.triggerEventData}
                          onChange={(next) => updateOutcome(index, { triggerEventData: next })}
                          hint="Prefilled answers on the follow-up's dialog. The scorer can change them."
                        />
                      </>
                    )}
                    <KeyValueEditor
                      label="Event Data"
                      value={outcome.eventData}
                      onChange={(next) => updateOutcome(index, { eventData: next })}
                      hint="Merged onto this event when the outcome is chosen, e.g. successful = true."
                    />
                  </Collapsible>
                ))}
              </View>
            )}
          </GlassCard>

          {/* REASONS */}
          <View className="flex-row items-center justify-between mb-3">
            <SectionLabel>Reasons</SectionLabel>
            <AddButton
              label="Add Group"
              onPress={() => writeReasons([...reasonGroups, { name: 'General', options: [] }])}
            />
          </View>
          <GlassCard className="border border-slate-200 dark:border-white/5 p-4 rounded-xl mb-6">
            <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 mb-3 leading-relaxed">
              Why the event was awarded, grouped under headings. Turn off "Individual Offender" for a
              reason nobody is personally at fault for — the player prompt is then skipped.
            </Text>
            {reasonGroups.length === 0 ? (
              <EmptyHint icon="pricetags-outline" text="No reasons — the event is not attributed to one." />
            ) : (
              <View className="space-y-2">
                {reasonGroups.map((group, groupIndex) => (
                  <Collapsible
                    key={groupIndex}
                    title={group.name || 'Untitled group'}
                    badge={`${group.options?.length || 0}`}
                    actions={
                      <RowActions
                        canMoveUp={groupIndex > 0}
                        canMoveDown={groupIndex < reasonGroups.length - 1}
                        onMoveUp={() => writeReasons(moveItem(reasonGroups, groupIndex, -1))}
                        onMoveDown={() => writeReasons(moveItem(reasonGroups, groupIndex, 1))}
                        onDelete={() => writeReasons(reasonGroups.filter((_, idx) => idx !== groupIndex))}
                      />
                    }
                  >
                    <TextField
                      label="Group Heading"
                      small
                      value={group.name || ''}
                      onChangeText={(text) => updateGroup(groupIndex, { name: text })}
                      placeholder="e.g. Set Piece"
                    />
                    <View className="flex-row items-center justify-between mt-1">
                      <Text className="font-inter-bold text-xs text-slate-700 dark:text-slate-300">Reasons</Text>
                      <AddButton
                        label="Add Reason"
                        onPress={() => updateGroup(groupIndex, { options: [...(group.options || []), { id: '', name: '' }] })}
                      />
                    </View>
                    {(group.options || []).length === 0 ? (
                      <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 italic">
                        A group with no reasons is rejected on save.
                      </Text>
                    ) : (
                      <View className="space-y-2">
                        {(group.options || []).map((option, optionIndex) => (
                          <Collapsible
                            key={optionIndex}
                            title={option.name || 'Untitled reason'}
                            subtitle={option.id}
                            badge={option.specifyPlayer === false ? 'No player' : undefined}
                            actions={
                              <RowActions
                                canMoveUp={optionIndex > 0}
                                canMoveDown={optionIndex < (group.options || []).length - 1}
                                onMoveUp={() =>
                                  updateGroup(groupIndex, { options: moveItem(group.options || [], optionIndex, -1) })
                                }
                                onMoveDown={() =>
                                  updateGroup(groupIndex, { options: moveItem(group.options || [], optionIndex, 1) })
                                }
                                onDelete={() =>
                                  updateGroup(groupIndex, {
                                    options: (group.options || []).filter((_, idx) => idx !== optionIndex),
                                  })
                                }
                              />
                            }
                          >
                            <TextField
                              label="Name"
                              small
                              value={option.name || ''}
                              onChangeText={(text) => setOptionName(groupIndex, optionIndex, text)}
                              placeholder="e.g. Early Push"
                            />
                            {savedIds.reasons.has(option.id) ? (
                              <LockedIdField label="Reason Id" value={option.id} />
                            ) : (
                              <TextField
                                label="Reason Id"
                                small
                                value={option.id || ''}
                                onChangeText={(text) => updateOption(groupIndex, optionIndex, { id: slugify(text) })}
                                placeholder="e.g. early_push"
                                autoCapitalize="none"
                              />
                            )}
                            <ToggleField
                              label="Individual Offender"
                              value={option.specifyPlayer !== false}
                              onChange={(value) =>
                                updateOption(groupIndex, optionIndex, { specifyPlayer: value ? undefined : false })
                              }
                              hint="Off for team offences like a collapsed scrum — the player screen is skipped and no actor is stored."
                            />
                          </Collapsible>
                        ))}
                      </View>
                    )}
                  </Collapsible>
                ))}
              </View>
            )}
          </GlassCard>

          {/* TEMPLATE-LEVEL TRIGGER */}
          <SectionLabel className="mb-3">Always Triggers</SectionLabel>
          <GlassCard className="border border-slate-200 dark:border-white/5 p-4 rounded-xl space-y-4 mb-6">
            <SelectField
              label="Follow-up Event"
              value={draft.triggerEventId || ''}
              onChange={(value) => patch({ triggerEventId: value || undefined })}
              options={triggerOptions}
              hint="Opened every time this event is recorded, whatever the outcome — a try always triggers its conversion. Per-outcome triggers take precedence."
            />
            {!!draft.triggerEventId && (
              <>
                <SelectField
                  label="Follow-up Belongs To"
                  value={draft.triggerTeam || 'same'}
                  onChange={(value) => patch({ triggerTeam: value as any })}
                  options={[
                    { value: 'same', label: 'Same team' },
                    { value: 'opponent', label: 'Opposing team' },
                  ]}
                />
                <KeyValueEditor
                  label="Follow-up Starts With"
                  value={draft.triggerEventData}
                  onChange={(next) => patch({ triggerEventData: next })}
                />
              </>
            )}
          </GlassCard>

          {/* DISPUTES */}
          <SectionLabel className="mb-3">Disputes</SectionLabel>
          <GlassCard className="border border-slate-200 dark:border-white/5 p-4 rounded-xl space-y-4 mb-6">
            <ToggleField
              label="Disputable"
              value={!!dispute}
              onChange={(value) =>
                patch({ disputeConfig: value ? { type: TemplateDisputeType.REMOVE, heading: `Remove ${draft.name || 'Event'}` } : undefined })
              }
              hint="Whether the other team can challenge this event from the scoreboard."
            />
            {!!dispute && (
              <>
                <SelectField
                  label="Dispute Type"
                  value={dispute.type}
                  onChange={(value) => patchDispute({ type: value })}
                  options={[
                    { value: TemplateDisputeType.REMOVE, label: 'Remove the event' },
                    { value: TemplateDisputeType.CHANGE_OUTCOME, label: 'Change the outcome' },
                  ]}
                />
                <TextField
                  label="Heading"
                  small
                  value={dispute.heading || ''}
                  onChangeText={(text) => patchDispute({ heading: text || undefined })}
                  placeholder="e.g. Remove Try"
                />
                <View className="flex-row gap-3">
                  <TextField
                    className="flex-1"
                    small
                    label="Approve Label"
                    value={dispute.approveLabel || ''}
                    onChangeText={(text) => patchDispute({ approveLabel: text || undefined })}
                    placeholder="Approve"
                  />
                  <TextField
                    className="flex-1"
                    small
                    label="Reject Label"
                    value={dispute.rejectLabel || ''}
                    onChangeText={(text) => patchDispute({ rejectLabel: text || undefined })}
                    placeholder="Reject"
                  />
                </View>
                <ToggleField
                  label="Recalculates Points"
                  value={!!dispute.impactsPoints}
                  onChange={(value) => patchDispute({ impactsPoints: value || undefined })}
                  hint="Changing the outcome re-derives the score from the outcome's points."
                />
                <ToggleField
                  label="Allow Undo"
                  value={dispute.allowUndo !== false}
                  onChange={(value) => patchDispute({ allowUndo: value ? undefined : false })}
                />
                <ToggleField
                  label="Allow Update"
                  value={dispute.allowUpdate !== false}
                  onChange={(value) => patchDispute({ allowUpdate: value ? undefined : false })}
                />
              </>
            )}
          </GlassCard>

          {/* ADVANCED */}
          <SectionLabel className="mb-3">Advanced</SectionLabel>
          <GlassCard className="border border-slate-200 dark:border-white/5 p-4 rounded-xl mb-6">
            <Collapsible title="Rarely used fields" subtitle="Event data and feed overrides">
              <KeyValueEditor
                label="Default Event Data"
                value={draft.eventData}
                onChange={(next) => patch({ eventData: next })}
                hint="Stored on every event of this type, before any outcome is chosen."
              />
              <JsonField
                label="Outcome Overrides (JSON)"
                value={draft.outcomeOverrides}
                onChange={(parsed, isValid) => {
                  setJsonValidity('outcomeOverrides', isValid);
                  if (isValid) patch({ outcomeOverrides: parsed });
                }}
                placeholder='{ "Penalty Kick": "KICK" }'
                hint="Short feed labels keyed by outcome name."
              />
            </Collapsible>
          </GlassCard>
        </ScrollView>
      </View>
    </Modal>
  );
}
