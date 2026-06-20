import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../../components/GlassCard';
import { Button } from '../../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../../../store/settingsStore';
import { wsService } from '../../../../services/websocket';
import { useWsStore } from '../../../../store/wsStore';
import { SocketAction, Sport, Organization } from '@sk/types';

export default function NewTeam() {
  const router = useRouter();
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore((state: any) => state.isConnected);

  // States
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [org, setOrg] = useState<Organization | null>(null);
  const [sports, setSports] = useState<Sport[]>([]);

  // Form Fields
  const [name, setName] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [selectedSportId, setSelectedSportId] = useState('');

  // Load org supported sports
  useEffect(() => {
    if (!isConnected || !orgId) return;

    setIsLoading(true);
    let active = true;

    // Get organization details
    wsService.emit('get_data', { type: 'organization', id: orgId }, (res: any) => {
      if (!active) return;
      if (res) {
        setOrg(res);
      }
    });

    // Get sports
    wsService.emit('get_data', { type: 'sports' }, (res: any) => {
      if (!active) return;
      if (Array.isArray(res)) {
        setSports(res);
        setIsLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [isConnected, orgId]);

  // Derived Sport List
  const availableSports = org?.supportedSportIds
    ? sports.filter(s => org.supportedSportIds?.includes(s.id))
    : sports;

  // Set default sport if only one is available
  useEffect(() => {
    if (availableSports.length === 1 && !selectedSportId) {
      setSelectedSportId(availableSports[0].id);
    }
  }, [availableSports]);

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Team Name is required.');
      return;
    }
    if (!ageGroup.trim()) {
      Alert.alert('Validation Error', 'Age Group is required (e.g., U19, First Team).');
      return;
    }
    if (!selectedSportId) {
      Alert.alert('Validation Error', 'Please select a sport.');
      return;
    }

    setIsSaving(true);
    wsService.emit('action', {
      type: SocketAction.ADD_TEAM,
      payload: {
        name: name.trim(),
        sportId: selectedSportId,
        ageGroup: ageGroup.trim().toUpperCase(),
        orgId,
      }
    }, (res: any) => {
      setIsSaving(false);
      if (res.status === 'ok') {
        router.replace({
          pathname: '/admin/[orgId]/teams/[teamId]',
          params: { orgId: orgId!, teamId: res.data.id }
        });
      } else {
        Alert.alert('Save Failed', res.message || 'Could not create team');
      }
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#FF3E00" />
          <Text className="font-orbitron text-xs text-slate-500 dark:text-slate-400 mt-3">Loading sports...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {/* HEADER BAR */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center gap-1 active:opacity-85"
        >
          <Ionicons name="chevron-back" size={20} color="#FF3E00" />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Cancel
          </Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white uppercase">
          Add New Team
        </Text>
        <View className="w-8" />
      </View>

      <ScrollView className="flex-1 px-6 py-6" keyboardShouldPersistTaps="handled">
        <GlassCard className="border border-slate-200 dark:border-white/5 p-6 mb-6">
          <Text className="font-orbitron-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Team details</Text>

          {/* TEAM NAME */}
          <View className="mb-4">
            <Text className="font-inter-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              Team Name
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. First XI, Under 15 A"
              placeholderTextColor="#94A3B8"
              className="font-inter text-sm text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 outline-none"
            />
          </View>

          {/* AGE GROUP */}
          <View className="mb-6">
            <Text className="font-inter-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              Age Group / Division
            </Text>
            <TextInput
              value={ageGroup}
              onChangeText={setAgeGroup}
              placeholder="e.g. U19, U15, Seniors"
              placeholderTextColor="#94A3B8"
              className="font-inter text-sm text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 outline-none"
            />
          </View>

          {/* SPORT SELECTOR */}
          <View className="mb-6">
            <Text className="font-inter-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Select Sport
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {availableSports.map(s => {
                const isSelected = selectedSportId === s.id;
                return (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => setSelectedSportId(s.id)}
                    className={`px-4 py-3 rounded-xl border flex-row items-center gap-2 ${
                      isSelected
                        ? 'bg-brand-orange border-brand-orange'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-white/5'
                    }`}
                  >
                    <Text className={`font-inter-bold text-xs ${isSelected ? 'text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                      {s.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {availableSports.length === 0 && (
                <Text className="font-inter text-xs text-amber-500">
                  No sports enabled for this organization. Enable sports in Org Settings.
                </Text>
              )}
            </View>
          </View>

          <Button
            title={isSaving ? "Creating Team..." : "Create Team"}
            onPress={handleSave}
            disabled={isSaving || !name.trim() || !ageGroup.trim() || !selectedSportId}
            className="w-full py-3.5 rounded-xl shadow-lg mt-4"
          />
        </GlassCard>
      </ScrollView>
    </SafeAreaView>
  );
}
