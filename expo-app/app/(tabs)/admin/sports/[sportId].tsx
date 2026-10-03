import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeBack } from '../../../../hooks/useSafeBack';
import { useAuthStore } from '../../../../store/authStore';
import { GlassCard } from '../../../../components/GlassCard';
import { Tabs } from '../../../../components/Tabs';
import { Ionicons } from '@expo/vector-icons';
import { apiService, Sport } from '../../../../services/api';
import { SportSettingsTab } from '../../../../components/admin/sports/SportSettingsTab';
import { SportPositionsTab } from '../../../../components/admin/sports/SportPositionsTab';
import { SportAgeGroupsTab } from '../../../../components/admin/sports/SportAgeGroupsTab';
import { AgeGroupAdminView } from '@sk/shared';
import { SportEventsTab } from '../../../../components/admin/sports/SportEventsTab';
import {
  EMPTY_FORM,
  SportForm,
  formFromSport,
  payloadFromForm,
} from '../../../../components/admin/sports/sportForm';

import { useActiveTheme } from '../../../../store/settingsStore';
import { themeColor } from '../../../../constants/Colors';
type SportTab = 'settings' | 'positions' | 'ageGroups' | 'events';

export default function EditSport() {
  const isDark = useActiveTheme() === 'dark';
  const safeBack = useSafeBack();
  const { sportId } = useLocalSearchParams<{ sportId: string }>();
  const token = useAuthStore(state => state.token);

  const isNew = sportId === 'new';

  const [isLoading, setIsLoading] = useState(!isNew);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SportTab>('settings');

  // Original data loaded from backend (null for new sports)
  const [originalSport, setOriginalSport] = useState<Sport | null>(null);

  const [form, setForm] = useState<SportForm>(EMPTY_FORM);
  // Not part of the form: each age-group change is written as it is made (see SportAgeGroupsTab).
  const [ageGroups, setAgeGroups] = useState<AgeGroupAdminView[]>([]);

  const setField = <K extends keyof SportForm>(field: K, value: SportForm[K]) =>
    setForm(prev => ({ ...prev, [field]: value }));

  useEffect(() => {
    if (isNew) {
      setIsLoading(false);
      return;
    }

    async function loadSport() {
      if (!token || !sportId) return;
      setIsLoading(true);
      setError(null);
      try {
        const [sport, sportAgeGroups] = await Promise.all([
          apiService.getAdminSport(token, sportId),
          apiService.getAdminAgeGroups(token, sportId),
        ]);
        setOriginalSport(sport);
        setForm(formFromSport(sport));
        setAgeGroups(sportAgeGroups);
      } catch (err: any) {
        console.error('[EditSport] Failed to load sport:', err);
        setError(err.message || 'Failed to load sport details.');
      } finally {
        setIsLoading(false);
      }
    }
    loadSport();
  }, [token, sportId, isNew]);

  // The form as the screen was last loaded or saved — what Cancel restores and what
  // "unsaved changes" is measured against.
  const baselineForm = useMemo(
    () => (originalSport ? formFromSport(originalSport) : EMPTY_FORM),
    [originalSport]
  );

  /** Section ids the sport was loaded with — those ids are referenced by its templates. */
  const savedSectionIds = useMemo(
    () => new Set((originalSport?.eventSections || []).map((section) => section.id)),
    [originalSport]
  );

  const hasChanges = useMemo(() => {
    const trimmed = {
      ...form,
      name: form.name.trim(),
      facilityTerm: form.facilityTerm.trim(),
      periodTerm: form.periodTerm.trim(),
    };
    return JSON.stringify(trimmed) !== JSON.stringify(baselineForm);
  }, [form, baselineForm]);

  const handleCancel = () => {
    if (isNew) {
      safeBack('/(tabs)/admin/sports');
      return;
    }
    if (!originalSport) return;
    setForm(baselineForm);
  };

  /** Everything that must hold before we send the sport, with the tab to open if it does not. */
  const validate = (): { message: string; tab: SportTab } | null => {
    if (!form.name.trim()) return { message: 'The sport needs a name.', tab: 'settings' };

    const numericFields: Array<{ label: string; value: string }> = [
      { label: 'Max Reserves', value: form.maxReserves },
      { label: 'Scheduled Periods', value: form.scheduledPeriods },
      { label: 'Period Length', value: form.periodLengthMinutes },
      { label: 'Yellow Card Duration', value: form.yellowCardMinutes },
      { label: 'Red Card Duration', value: form.redCardMinutes },
    ];
    for (const field of numericFields) {
      if (field.value.trim() === '') continue;
      const parsed = Number(field.value);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return { message: `${field.label} must be a non-negative number.`, tab: 'settings' };
      }
    }

    const positionIds = new Set<string>();
    for (const position of form.positions) {
      if (!position.id.trim()) return { message: 'Position IDs (abbreviations) cannot be empty.', tab: 'positions' };
      if (!position.name.trim()) return { message: `Position name for "${position.id}" cannot be empty.`, tab: 'positions' };
      if (positionIds.has(position.id)) {
        return { message: `Duplicate position ID "${position.id}". Each position needs a unique abbreviation.`, tab: 'positions' };
      }
      positionIds.add(position.id);
    }

    const sectionIds = new Set<string>();
    for (const section of form.eventSections) {
      if (!section.id?.trim() || !section.name?.trim()) {
        return { message: 'Every section needs a name and an id.', tab: 'events' };
      }
      if (sectionIds.has(section.id)) {
        return { message: `Two sections share the id "${section.id}".`, tab: 'events' };
      }
      sectionIds.add(section.id);
    }

    // Templates are validated in full by the server; these catch the states the editor can
    // leave behind, where pointing at the offending tab is more use than a server message.
    const templateIds = new Set<string>();
    for (const template of form.eventTemplates) {
      if (!template.id?.trim() || !template.name?.trim()) {
        return { message: `"${template.name || template.id || 'An event'}" is incomplete — open it and fill in its name and id.`, tab: 'events' };
      }
      if (templateIds.has(template.id)) {
        return { message: `Two events share the id "${template.id}".`, tab: 'events' };
      }
      templateIds.add(template.id);
      if (!sectionIds.has(template.section)) {
        return {
          message: `"${template.name}" is filed under "${template.section || 'nothing'}", which is not one of this sport's sections.`,
          tab: 'events',
        };
      }
    }

    return null;
  };

  const handleSave = async () => {
    if (!token) return;

    const problem = validate();
    if (problem) {
      setActiveTab(problem.tab);
      Alert.alert('Validation Error', problem.message);
      return;
    }

    setIsProcessing(true);
    try {
      const payload = payloadFromForm(form, originalSport);

      if (isNew) {
        await apiService.createAdminSport(token, payload);
        Alert.alert('Success', 'Sport created successfully.', [
          { text: 'OK', onPress: () => safeBack('/(tabs)/admin/sports') }
        ]);
      } else if (sportId) {
        const updated = await apiService.updateAdminSport(token, sportId, payload);
        setOriginalSport(updated);
        setForm(formFromSport(updated));
        Alert.alert('Success', 'Sport configuration saved successfully.');
      }
    } catch (err: any) {
      console.error('[EditSport] Save failed:', err);
      Alert.alert('Error', err.message || 'Failed to save sport settings.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-canvas">
        <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} />
      </View>
    );
  }

  if (error || (!originalSport && !isNew)) {
    return (
      <View className="flex-1 justify-center items-center bg-canvas px-6">
        <GlassCard className="border border-danger-line bg-danger-soft p-6 rounded-xl w-full items-center">
          <Ionicons name="alert-circle-outline" size={36} color={themeColor(isDark, 'danger')} />
          <Text className="font-orbitron-bold text-sm text-ink mt-4 text-center">
            Failed to Load Sport
          </Text>
          <Text className="font-inter text-xs text-ink-muted mt-2 text-center leading-relaxed">
            {error || 'The requested sport configuration could not be found.'}
          </Text>
        </GlassCard>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      <View className="px-6 pt-4">
        <Tabs<SportTab>
          items={[
            { key: 'settings', label: 'Settings', icon: 'options-outline' },
            { key: 'positions', label: 'Positions', icon: 'people-outline', badge: form.positions.length || undefined },
            {
              key: 'ageGroups',
              label: 'Age Groups',
              icon: 'layers-outline',
              // The custom entries are the ones waiting on a decision, so they are what is counted.
              badge: ageGroups.filter(group => !group.isOfficial).length || undefined,
            },
            { key: 'events', label: 'Events', icon: 'flash-outline', badge: form.eventTemplates.length || undefined },
          ]}
          activeKey={activeTab}
          onChange={setActiveTab}
          variant="underline"
        />
      </View>

      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 140 }}>
        {activeTab === 'settings' && (
          <SportSettingsTab
            form={form}
            setField={setField}
            showCardSettings={form.eventTemplates.length > 0}
          />
        )}

        {activeTab === 'positions' && (
          <SportPositionsTab
            positions={form.positions}
            onChange={(positions) => setField('positions', positions)}
          />
        )}

        {activeTab === 'ageGroups' && (
          isNew || !sportId || !token ? (
            <Text className="font-inter text-xs text-ink-muted leading-relaxed">
              Create the sport first. It starts with the standard age groups (U9 to U19, and Open),
              which you can then change here.
            </Text>
          ) : (
            <SportAgeGroupsTab sportId={sportId} token={token} ageGroups={ageGroups} onChange={setAgeGroups} />
          )
        )}

        {activeTab === 'events' && (
          <SportEventsTab
            sections={form.eventSections}
            onSectionsChange={(sections) => setField('eventSections', sections)}
            templates={form.eventTemplates}
            savedTemplates={originalSport?.eventTemplates || []}
            savedSectionIds={savedSectionIds}
            onChange={(templates) => setField('eventTemplates', templates)}
          />
        )}
      </ScrollView>

      {/* FLOATING SAVE CHANGES BAR */}
      {hasChanges && (
        <View className="absolute bottom-6 left-6 right-6 bg-card border border-line p-4 rounded-2xl flex-row items-center justify-between shadow-xl z-40">
          <View className="flex-1 mr-4">
            <Text className="font-orbitron-bold text-[10px] text-ink uppercase tracking-wider">
              {isNew ? 'Create New Sport' : 'Unsaved Changes'}
            </Text>
            <Text className="font-inter text-[9px] text-ink-muted mt-0.5">
              {isNew ? 'Click Create to add this sport.' : 'You have modified this sport\'s configuration.'}
            </Text>
          </View>
          <View className="flex-row items-center gap-2.5">
            <TouchableOpacity
              onPress={handleCancel}
              disabled={isProcessing}
              className="bg-sunken px-4 py-2.5 rounded-xl active:scale-95 border border-line"
            >
              <Text className="font-orbitron-bold text-[9px] text-ink-soft uppercase tracking-widest">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              disabled={isProcessing || !form.name.trim()}
              className="bg-primary px-5 py-2.5 rounded-xl flex-row items-center gap-2 active:scale-95 shadow-md shadow-primary/30"
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={14} color="white" />
                  <Text className="font-orbitron-bold text-[9px] text-on-fill uppercase tracking-widest mt-0.5">
                    {isNew ? 'Create' : 'Save'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
