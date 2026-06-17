import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '../../../../store/authStore';
import { useActiveTheme } from '../../../../store/settingsStore';
import { GlassCard } from '../../../../components/GlassCard';
import { Ionicons } from '@expo/vector-icons';
import { apiService, Sport, SportPosition } from '../../../../services/api';

export default function EditSport() {
  const router = useRouter();
  const { sportId } = useLocalSearchParams<{ sportId: string }>();
  const token = useAuthStore(state => state.token);
  const isDark = useActiveTheme() === 'dark';

  const isNew = sportId === 'new';

  const [isLoading, setIsLoading] = useState(!isNew);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Original data loaded from backend (null for new sports)
  const [originalSport, setOriginalSport] = useState<Sport | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [facilityTerm, setFacilityTerm] = useState('');
  const [periodTerm, setPeriodTerm] = useState('');
  const [positions, setPositions] = useState<SportPosition[]>([]);

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
        const sport = await apiService.getAdminSport(token, sportId);
        setOriginalSport(sport);
        setName(sport.name || '');
        setFacilityTerm(sport.facilityTerm || '');
        setPeriodTerm(sport.periodTerm || '');
        setPositions(sport.defaultSettings?.positions || []);
      } catch (err: any) {
        console.error('[EditSport] Failed to load sport:', err);
        setError(err.message || 'Failed to load sport details.');
      } finally {
        setIsLoading(false);
      }
    }
    loadSport();
  }, [token, sportId, isNew]);

  // Determine if there are changes
  const hasChanges = useMemo(() => {
    if (isNew) {
      return name.trim() !== '' || facilityTerm.trim() !== '' || periodTerm.trim() !== '' || positions.length > 0;
    }

    if (!originalSport) return false;
    
    const originalPositions = originalSport.defaultSettings?.positions || [];
    const positionsChanged = positions.length !== originalPositions.length || 
      positions.some((pos, idx) => {
        const orig = originalPositions[idx];
        return !orig || pos.id !== orig.id || pos.name !== orig.name;
      });

    return (
      name.trim() !== (originalSport.name || '') ||
      facilityTerm.trim() !== (originalSport.facilityTerm || '') ||
      periodTerm.trim() !== (originalSport.periodTerm || '') ||
      positionsChanged
    );
  }, [originalSport, name, facilityTerm, periodTerm, positions, isNew]);

  const handlePositionIdChange = (index: number, text: string) => {
    setPositions(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], id: text.toUpperCase().replace(/\s+/g, '') };
      return copy;
    });
  };

  const handlePositionNameChange = (index: number, text: string) => {
    setPositions(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], name: text };
      return copy;
    });
  };

  const addPosition = () => {
    setPositions(prev => [...prev, { id: '', name: '' }]);
  };

  const removePosition = (index: number) => {
    setPositions(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleCancel = () => {
    if (isNew) {
      router.back();
      return;
    }
    if (!originalSport) return;
    setName(originalSport.name || '');
    setFacilityTerm(originalSport.facilityTerm || '');
    setPeriodTerm(originalSport.periodTerm || '');
    setPositions(originalSport.defaultSettings?.positions || []);
  };

  const handleSave = async () => {
    if (!token || !name.trim()) return;

    // Validate that position IDs are unique and not empty
    const uniqueIds = new Set<string>();
    for (const pos of positions) {
      if (!pos.id.trim()) {
        Alert.alert('Validation Error', 'Position IDs (abbreviations) cannot be empty.');
        return;
      }
      if (!pos.name.trim()) {
        Alert.alert('Validation Error', `Position name for "${pos.id}" cannot be empty.`);
        return;
      }
      if (uniqueIds.has(pos.id)) {
        Alert.alert('Validation Error', `Duplicate position ID "${pos.id}" detected. Each position must have a unique abbreviation.`);
        return;
      }
      uniqueIds.add(pos.id);
    }

    setIsProcessing(true);
    try {
      const payload = {
        name: name.trim(),
        facilityTerm: facilityTerm.trim(),
        periodTerm: periodTerm.trim(),
        defaultSettings: {
          ...(originalSport?.defaultSettings || {}),
          positions: positions
        }
      };

      if (isNew) {
        await apiService.createAdminSport(token, payload);
        Alert.alert('Success', 'Sport created successfully.', [
          { text: 'OK', onPress: () => router.back() }
        ]);
      } else if (sportId) {
        const updated = await apiService.updateAdminSport(token, sportId, payload);
        setOriginalSport(updated);
        setName(updated.name || '');
        setFacilityTerm(updated.facilityTerm || '');
        setPeriodTerm(updated.periodTerm || '');
        setPositions(updated.defaultSettings?.positions || []);
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
      <View className="flex-1 justify-center items-center bg-slate-50 dark:bg-slate-950">
        <ActivityIndicator size="large" color="#FF3E00" />
      </View>
    );
  }

  if (error || (!originalSport && !isNew)) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-50 dark:bg-slate-950 px-6">
        <GlassCard className="border border-red-200 dark:border-red-950/20 bg-red-500/5 p-6 rounded-xl w-full items-center">
          <Ionicons name="alert-circle-outline" size={36} color="#EF4444" />
          <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white mt-4 text-center">
            Failed to Load Sport
          </Text>
          <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mt-2 text-center leading-relaxed">
            {error || 'The requested sport configuration could not be found.'}
          </Text>
        </GlassCard>
      </View>
    );
  }

  const isCodeConfigured = !isNew && originalSport?.eventTemplates && originalSport.eventTemplates.length > 0;

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 120 }}>
        {/* CORE DETAILS */}
        <Text className="font-orbitron-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
          Sport General Details
        </Text>
        <GlassCard className="border border-slate-200 dark:border-white/5 p-4 rounded-xl space-y-4 mb-6">
          <View>
            <Text className="font-inter-bold text-xs text-slate-700 dark:text-slate-300 mb-1.5">Sport Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Soccer, Netball"
              className="bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-white/5 p-3 rounded-xl font-inter text-sm text-slate-800 dark:text-white"
            />
          </View>

          <View className="flex-row gap-4">
            <View className="flex-1">
              <Text className="font-inter-bold text-xs text-slate-700 dark:text-slate-300 mb-1.5">Facility Term</Text>
              <TextInput
                value={facilityTerm}
                onChangeText={setFacilityTerm}
                placeholder="e.g. Field, Court"
                className="bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-white/5 p-3 rounded-xl font-inter text-sm text-slate-800 dark:text-white"
              />
            </View>
            <View className="flex-1">
              <Text className="font-inter-bold text-xs text-slate-700 dark:text-slate-300 mb-1.5">Period Term</Text>
              <TextInput
                value={periodTerm}
                onChangeText={setPeriodTerm}
                placeholder="e.g. Half, Quarter, Period"
                className="bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-white/5 p-3 rounded-xl font-inter text-sm text-slate-800 dark:text-white"
              />
            </View>
          </View>
        </GlassCard>

        {/* DEFAULT PLAYER POSITIONS */}
        <View className="flex-row items-center justify-between mb-3">
          <Text className="font-orbitron-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            Default Team Positions
          </Text>
          <TouchableOpacity
            onPress={addPosition}
            className="flex-row items-center gap-1 bg-slate-200 dark:bg-slate-850 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-white/5 active:opacity-80"
          >
            <Ionicons name="add" size={12} color="#FF3E00" />
            <Text className="font-orbitron-bold text-[8px] text-slate-700 dark:text-slate-300 uppercase tracking-wider mt-0.5">Add Position</Text>
          </TouchableOpacity>
        </View>
        
        <GlassCard className="border border-slate-200 dark:border-white/5 p-4 rounded-xl mb-6">
          {positions.length === 0 ? (
            <View className="items-center py-6">
              <Ionicons name="people-outline" size={24} color="#94A3B8" />
              <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 italic mt-2">
                No positions added. Click "Add Position" above to configure some.
              </Text>
            </View>
          ) : (
            <View className="space-y-3">
              {positions.map((pos, index) => (
                <View key={index} className="flex-row items-center gap-2.5">
                  <View className="w-16">
                    <TextInput
                      value={pos.id}
                      onChangeText={(text) => handlePositionIdChange(index, text)}
                      placeholder="ID (e.g. GK)"
                      autoCapitalize="characters"
                      className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-white/5 px-2 py-2.5 rounded-xl font-orbitron-bold text-xs text-center text-slate-800 dark:text-white"
                    />
                  </View>
                  <View className="flex-1">
                    <TextInput
                      value={pos.name}
                      onChangeText={(text) => handlePositionNameChange(index, text)}
                      placeholder="Name (e.g. Goalkeeper)"
                      className="bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-white/5 px-3 py-2.5 rounded-xl font-inter text-sm text-slate-800 dark:text-white"
                    />
                  </View>
                  <TouchableOpacity
                    onPress={() => removePosition(index)}
                    className="p-2.5 bg-red-500/10 dark:bg-red-500/5 border border-red-500/20 rounded-xl active:opacity-80"
                  >
                    <Ionicons name="trash" size={14} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </GlassCard>

        {/* SYSTEM DETAILS SECTION (Only when editing an existing sport) */}
        {!isNew && originalSport && (
          <>
            <Text className="font-orbitron-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
              System Rules & Configuration (Read-only)
            </Text>
            <GlassCard className="border border-slate-200 dark:border-white/5 p-4 rounded-xl space-y-3">
              <View className="flex-row justify-between py-1.5 border-b border-slate-100 dark:border-white/5">
                <Text className="font-inter text-xs text-slate-400 dark:text-slate-500">Participant Type</Text>
                <Text className="font-orbitron-bold text-xs text-slate-700 dark:text-slate-300">
                  {originalSport.participantType || 'TEAM'}
                </Text>
              </View>
              <View className="flex-row justify-between py-1.5 border-b border-slate-100 dark:border-white/5">
                <Text className="font-inter text-xs text-slate-400 dark:text-slate-500">Match Topology</Text>
                <Text className="font-orbitron-bold text-xs text-slate-700 dark:text-slate-300">
                  {originalSport.matchTopology || 'HEAD_TO_HEAD'}
                </Text>
              </View>
              <View className="flex-row justify-between py-1.5 border-b border-slate-100 dark:border-white/5">
                <Text className="font-inter text-xs text-slate-400 dark:text-slate-500">Max Reserves</Text>
                <Text className="font-orbitron-bold text-xs text-slate-700 dark:text-slate-300">
                  {originalSport.defaultSettings?.maxReserves ?? 'N/A'}
                </Text>
              </View>
              
              {isCodeConfigured && (
                <>
                  <View className="flex-row justify-between py-1.5 border-b border-slate-100 dark:border-white/5">
                    <Text className="font-inter text-xs text-slate-400 dark:text-slate-500">Yellow Card Duration</Text>
                    <Text className="font-orbitron-bold text-xs text-slate-700 dark:text-slate-300">
                      {originalSport.defaultSettings?.yellowCardDurationMS 
                        ? `${originalSport.defaultSettings.yellowCardDurationMS / 60000} mins` 
                        : 'N/A'}
                    </Text>
                  </View>
                  <View className="flex-row justify-between py-1.5">
                    <Text className="font-inter text-xs text-slate-400 dark:text-slate-500">Timed Red Cards Allowed</Text>
                    <Text className="font-orbitron-bold text-xs text-slate-700 dark:text-slate-300">
                      {originalSport.defaultSettings?.allowTimedRedCard ? 'Yes' : 'No'}
                    </Text>
                  </View>
                </>
              )}
            </GlassCard>
          </>
        )}
      </ScrollView>

      {/* FLOATING SAVE CHANGES BAR */}
      {hasChanges && (
        <View className="absolute bottom-6 left-6 right-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 p-4 rounded-2xl flex-row items-center justify-between shadow-xl z-40">
          <View className="flex-1 mr-4">
            <Text className="font-orbitron-bold text-[10px] text-slate-800 dark:text-white uppercase tracking-wider">
              {isNew ? 'Create New Sport' : 'Unsaved Changes'}
            </Text>
            <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">
              {isNew ? 'Click Create to add this sport.' : 'You have modified this sport\'s configuration.'}
            </Text>
          </View>
          <View className="flex-row items-center gap-2.5">
            <TouchableOpacity
              onPress={handleCancel}
              disabled={isProcessing}
              className="bg-slate-100 dark:bg-slate-800 px-4 py-2.5 rounded-xl active:scale-95 border border-slate-200 dark:border-white/5"
            >
              <Text className="font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-300 uppercase tracking-widest">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              disabled={isProcessing || !name.trim()}
              className="bg-brand-orange px-5 py-2.5 rounded-xl flex-row items-center gap-2 active:scale-95 shadow-md shadow-brand-orange/30"
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={14} color="white" />
                  <Text className="font-orbitron-bold text-[9px] text-white uppercase tracking-widest mt-0.5">
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
