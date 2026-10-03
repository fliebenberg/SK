import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GUARDIAN_RELATIONSHIPS } from '@sk/shared';
import { PersonnelAutocomplete } from '../PersonnelAutocomplete';
import { FieldLabel } from '../FieldLabel';
import { TEXT_INPUT } from '../formStyles';
import { SegmentedControl } from '../SegmentedControl';
import { GuardianDraft, RELATIONSHIP_LABELS } from './guardianDraft';
import { formatCellphone } from '../../utils/phone';

interface GuardianDraftFieldsProps {
  orgId: string;
  draft: GuardianDraft;
  onChange: (draft: GuardianDraft) => void;
  /** Offer "make primary" — only when the player already has a guardian. */
  showPrimary?: boolean;
  /** The player themselves, who cannot be picked as their own guardian. */
  excludeProfileId?: string;
}

/**
 * The fields for one guardian: pick someone already in the organisation, or type a new person's
 * name and contact details, plus how they are related. Controlled — the owner keeps the
 * {@link GuardianDraft} and saves it with `saveGuardianDraft`.
 */
export function GuardianDraftFields({ orgId, draft, onChange, showPrimary, excludeProfileId }: GuardianDraftFieldsProps) {
  const set = (patch: Partial<GuardianDraft>) => onChange({ ...draft, ...patch });

  return (
    <View className="gap-4">
      <View className="gap-1.5" style={{ zIndex: 50 }}>
        <FieldLabel label="Guardian’s name" />
        {draft.existingId ? (
          <View className="flex-row items-center justify-between bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3">
            <View className="flex-1 mr-3">
              <Text className="font-inter-bold text-sm text-slate-800 dark:text-white">{draft.name}</Text>
              <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {draft.email || 'Already on record in this organisation'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => set({ existingId: null, name: '', email: '', cellphone: '' })}
              accessibilityRole="button"
              className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800"
            >
              <Text className="font-inter-bold text-sm text-orange-700 dark:text-brand-orange">Change</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <PersonnelAutocomplete
            orgId={orgId}
            value={draft.name}
            placeholder="Search this organisation or type a new name..."
            onChangeText={name => set({ name })}
            onSelectPerson={person => {
              if (!person || person.id === excludeProfileId) return;
              set({ existingId: person.id, name: person.name, email: person.email || '', cellphone: formatCellphone(person.cellphone) });
            }}
          />
        )}
      </View>

      {!draft.existingId ? (
        <View className="flex-row flex-wrap gap-3">
          <View className="flex-1 gap-1.5" style={{ minWidth: 180 }}>
            <FieldLabel label="Guardian’s email" />
            <TextInput
              value={draft.email}
              onChangeText={email => set({ email })}
              placeholder="Their own email"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              keyboardType="email-address"
              className={TEXT_INPUT}
            />
          </View>
          <View className="flex-1 gap-1.5" style={{ minWidth: 160 }}>
            <FieldLabel label="Guardian’s cell" />
            <TextInput
              value={draft.cellphone}
              onChangeText={cellphone => set({ cellphone })}
              placeholder="e.g. +27 82 123 4567"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
              className={TEXT_INPUT}
            />
          </View>
        </View>
      ) : null}

      <View className="gap-1.5">
        <FieldLabel label="Relationship" />
        <SegmentedControl
          options={GUARDIAN_RELATIONSHIPS.map(value => ({ key: value, label: RELATIONSHIP_LABELS[value] }))}
          value={draft.relationship}
          onChange={relationship => set({ relationship })}
          isCompact={false}
        />
      </View>

      {showPrimary ? (
        <View className="flex-row items-center justify-between">
          <View className="flex-1 mr-3 flex-row items-center gap-2">
            <Ionicons name="star-outline" size={14} color="#94A3B8" />
            <Text className="font-inter text-sm text-slate-700 dark:text-slate-300">Make this the primary contact</Text>
          </View>
          <Switch value={draft.makePrimary} onValueChange={makePrimary => set({ makePrimary })} />
        </View>
      ) : null}
    </View>
  );
}
