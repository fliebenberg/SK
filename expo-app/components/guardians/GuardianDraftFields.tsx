import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GUARDIAN_RELATIONSHIPS } from '@sk/shared';
import { PersonnelAutocomplete } from '../PersonnelAutocomplete';
import { useActiveTheme } from '../../store/settingsStore';
import { GuardianDraft, RELATIONSHIP_LABELS } from './guardianDraft';

interface GuardianDraftFieldsProps {
  orgId: string;
  draft: GuardianDraft;
  onChange: (draft: GuardianDraft) => void;
  /** Offer "make primary" — only when the player already has a guardian. */
  showPrimary?: boolean;
  /** The player themselves, who cannot be picked as their own guardian. */
  excludeProfileId?: string;
}

const LABEL = 'font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5';
const INPUT = 'font-inter text-sm text-slate-800 dark:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 outline-none';

/**
 * The fields for one guardian: pick someone already in the organisation, or type a new person's
 * name and contact details, plus how they are related. Controlled — the owner keeps the
 * {@link GuardianDraft} and saves it with `saveGuardianDraft`.
 */
export function GuardianDraftFields({ orgId, draft, onChange, showPrimary, excludeProfileId }: GuardianDraftFieldsProps) {
  const isDark = useActiveTheme() === 'dark';
  const set = (patch: Partial<GuardianDraft>) => onChange({ ...draft, ...patch });

  return (
    <View className="space-y-4">
      <View style={{ zIndex: 50 }}>
        <Text className={LABEL}>Guardian’s name</Text>
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
              className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800"
            >
              <Text className="font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-300 uppercase tracking-widest">Change</Text>
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
              set({ existingId: person.id, name: person.name, email: person.email || '', cellphone: person.cellphone || '' });
            }}
          />
        )}
      </View>

      {!draft.existingId ? (
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Text className={LABEL}>Guardian’s email</Text>
            <TextInput
              value={draft.email}
              onChangeText={email => set({ email })}
              placeholder="Their own email"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              keyboardType="email-address"
              className={INPUT}
            />
          </View>
          <View className="flex-1">
            <Text className={LABEL}>Guardian’s cell</Text>
            <TextInput
              value={draft.cellphone}
              onChangeText={cellphone => set({ cellphone })}
              placeholder="e.g. +27 82 123 4567"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
              className={INPUT}
            />
          </View>
        </View>
      ) : null}

      <View>
        <Text className={LABEL}>Relationship</Text>
        <View className="flex-row flex-wrap gap-2">
          {GUARDIAN_RELATIONSHIPS.map(relationship => {
            const selected = draft.relationship === relationship;
            return (
              <TouchableOpacity
                key={relationship}
                onPress={() => set({ relationship })}
                style={{
                  borderWidth: 1,
                  borderColor: selected ? '#FF3E00' : (isDark ? 'rgba(255,255,255,0.1)' : '#CBD5E1'),
                  backgroundColor: selected ? '#FF3E00' : 'transparent',
                }}
                className="px-3 py-2 rounded-xl active:scale-95"
              >
                <Text
                  style={{ color: selected ? '#fff' : (isDark ? '#94A3B8' : '#64748B') }}
                  className="font-orbitron-bold text-[9px] uppercase tracking-widest"
                >
                  {RELATIONSHIP_LABELS[relationship]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
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
