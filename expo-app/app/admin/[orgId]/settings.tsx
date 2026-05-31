import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { GlassCard } from '../../../components/GlassCard';
import { Button } from '../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../../store/settingsStore';

export default function OrgSettings() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const isDark = useActiveTheme() === 'dark';

  // State mimicking form inputs
  const [orgName, setOrgName] = useState('Premier Rugby Union');
  const [shortName, setShortName] = useState('PRU');
  const [primaryColor, setPrimaryColor] = useState('#FF3E00');
  const [secondaryColor, setSecondaryColor] = useState('#00E5FF');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = () => {
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="mb-6">
          <Text className="font-orbitron-bold text-xl text-slate-800 dark:text-white uppercase mb-1">
            Branding & Profile
          </Text>
          <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
            Configure the organization name, branding colors, and logo details visible across the client scoreboard feeds.
          </Text>
        </View>

        {saveSuccess && (
          <GlassCard className="bg-emerald-500/10 border border-emerald-500/20 p-4 mb-6 flex-row items-center gap-3">
            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            <Text className="font-inter-bold text-xs text-emerald-600 dark:text-emerald-400">
              Settings saved successfully! (Demo Simulation)
            </Text>
          </GlassCard>
        )}

        {/* PROFILE FIELD CARD */}
        <GlassCard className="border border-slate-200 dark:border-white/5 p-5 mb-6 space-y-4">
          <View>
            <Text className="font-orbitron-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
              Organization Name
            </Text>
            <TextInput
              value={orgName}
              onChangeText={setOrgName}
              placeholder="e.g. Premier Rugby Union"
              placeholderTextColor="#94A3B8"
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-800 dark:text-white"
            />
          </View>

          <View>
            <Text className="font-orbitron-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
              Short Name / Abbreviation
            </Text>
            <TextInput
              value={shortName}
              onChangeText={setShortName}
              placeholder="e.g. PRU"
              placeholderTextColor="#94A3B8"
              maxLength={6}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-800 dark:text-white"
            />
          </View>
        </GlassCard>

        {/* BRANDING COLOR SPECIFICATION */}
        <Text className="font-orbitron-bold text-xs text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">
          Branding Colors
        </Text>
        <GlassCard className="border border-slate-200 dark:border-white/5 p-5 mb-8 space-y-4">
          <View className="flex-row gap-4">
            <View className="flex-1">
              <Text className="font-orbitron-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                Primary Hex
              </Text>
              <TextInput
                value={primaryColor}
                onChangeText={setPrimaryColor}
                placeholder="#FF3E00"
                placeholderTextColor="#94A3B8"
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-mono text-sm text-slate-800 dark:text-white"
              />
            </View>
            <View className="flex-1">
              <Text className="font-orbitron-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                Secondary Hex
              </Text>
              <TextInput
                value={secondaryColor}
                onChangeText={setSecondaryColor}
                placeholder="#00E5FF"
                placeholderTextColor="#94A3B8"
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-mono text-sm text-slate-800 dark:text-white"
              />
            </View>
          </View>

          {/* PALETTE PREVIEW CONTAINER */}
          <Text className="font-orbitron-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-2 mb-1">
            Harmony Theme Preview
          </Text>
          <View className="flex-row rounded-xl overflow-hidden h-14 border border-slate-200 dark:border-white/5">
            <View 
              className="flex-1 items-center justify-center"
              style={{ backgroundColor: primaryColor }}
            >
              <Text className="font-orbitron-bold text-[10px] text-white tracking-widest drop-shadow-sm uppercase">
                Primary
              </Text>
            </View>
            <View 
              className="flex-1 items-center justify-center"
              style={{ backgroundColor: secondaryColor }}
            >
              <Text className="font-orbitron-bold text-[10px] text-slate-900 tracking-widest drop-shadow-sm uppercase">
                Secondary
              </Text>
            </View>
          </View>
        </GlassCard>

        <Button
          title="Save Branding Profile"
          variant="primary"
          onPress={handleSave}
          className="w-full shadow-md shadow-brand-orange/20"
        />
      </ScrollView>
    </View>
  );
}
