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

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Original data loaded from backend
  const [originalSport, setOriginalSport] = useState<Sport | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [facilityTerm, setFacilityTerm] = useState('');
  const [periodTerm, setPeriodTerm] = useState('');
  const [positions, setPositions] = useState<SportPosition[]>([]);

  useEffect(() => {
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
  }, [token, sportId]);

  // Determine if there are changes
  const hasChanges = useMemo(() => {
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
  }, [originalSport, name, facilityTerm, periodTerm, positions]);

  const handlePositionNameChange = (id: string, text: string) => {
    setPositions(prev =>
      prev.map(pos => (pos.id === id ? { ...pos, name: text } : pos))
    );
  };

  const handleCancel = () => {
    if (!originalSport) return;
    setName(originalSport.name || '');
    setFacilityTerm(originalSport.facilityTerm || '');
    setPeriodTerm(originalSport.periodTerm || '');
    setPositions(originalSport.defaultSettings?.positions || []);
  };

  const handleSave = async () => {
    if (!token || !sportId || !name.trim()) return;
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

      const updated = await apiService.updateAdminSport(token, sportId, payload);
      setOriginalSport(updated);
      
      // Update form fields with cleaned/saved values
      setName(updated.name || '');
      setFacilityTerm(updated.facilityTerm || '');
      setPeriodTerm(updated.periodTerm || '');
      setPositions(updated.defaultSettings?.positions || []);

      Alert.alert('Success', 'Sport configuration saved successfully.');
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

  if (error || !originalSport) {
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

  const isCodeConfigured = originalSport.eventTemplates && originalSport.eventTemplates.length > 0;

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
        <Text className="font-orbitron-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
          Default Team Positions
        </Text>
        <GlassCard className="border border-slate-200 dark:border-white/5 p-4 rounded-xl mb-6">
          {positions.length === 0 ? (
            <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 italic py-2">
              No default positions configured for this sport.
            </Text>
          ) : (
            <View className="space-y-3">
              {positions.map((pos) => (
                <View key={pos.id} className="flex-row items-center gap-3">
                  <View className="w-12 h-10 rounded-lg bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-white/5 items-center justify-center">
                    <Text className="font-orbitron-bold text-xs text-slate-500 dark:text-slate-400">{pos.id}</Text>
                  </View>
                  <TextInput
                    value={pos.name}
                    onChangeText={(text) => handlePositionNameChange(pos.id, text)}
                    placeholder="Position Name"
                    className="flex-1 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-white/5 px-3 py-2.5 rounded-xl font-inter text-sm text-slate-800 dark:text-white"
                  />
                </View>
              ))}
            </View>
          )}
        </GlassCard>

        {/* CODE-CONFIGURED / SYSTEM DETAILS SECTION */}
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
      </ScrollView>

      {/* FLOATING SAVE CHANGES BAR */}
      {hasChanges && (
        <View className="absolute bottom-6 left-6 right-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 p-4 rounded-2xl flex-row items-center justify-between shadow-xl z-40">
          <View className="flex-1 mr-4">
            <Text className="font-orbitron-bold text-[10px] text-slate-800 dark:text-white uppercase tracking-wider">
              Unsaved Changes
            </Text>
            <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">
              You have modified this sport's configuration.
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
                    Save
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
