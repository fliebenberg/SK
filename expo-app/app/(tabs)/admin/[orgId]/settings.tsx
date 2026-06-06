import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Image, useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { GlassCard } from '../../../../components/GlassCard';
import { Button } from '../../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../../../store/settingsStore';
import { wsService } from '../../../../services/websocket';
import { useWsStore } from '../../../../store/wsStore';
import { SocketAction } from '@sk/types';

function getContrastColor(hexcolor: string | undefined): string {
  if (!hexcolor || hexcolor === 'transparent' || hexcolor === 'undefined') return '#ffffff';
  let hex = hexcolor.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(char => char + char).join('');
  }
  if (hex.length !== 6) return '#ffffff';
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return '#ffffff';
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? '#000000' : '#ffffff';
}

function hexToRgba(hex: string | undefined, opacity: number): string {
  if (!hex || hex === 'transparent' || hex === 'undefined') return `rgba(255, 62, 0, ${opacity})`;
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(char => char + char).join('');
  }
  if (cleanHex.length !== 6) return `rgba(255, 62, 0, ${opacity})`;
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(255, 62, 0, ${opacity})`;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export default function OrgSettings() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore(state => state.isConnected);

  const [isLoading, setIsLoading] = useState(true);
  const [orgName, setOrgName] = useState('');
  const [shortName, setShortName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('');
  const [secondaryColor, setSecondaryColor] = useState('');
  const [logo, setLogo] = useState('');
  const [description, setDescription] = useState('');
  
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Inline editing states
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState('');

  const [isEditingShortName, setIsEditingShortName] = useState(false);
  const [tempShortName, setTempShortName] = useState('');

  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [tempDescription, setTempDescription] = useState('');

  // Overlay modal states
  const [isEditingLogo, setIsEditingLogo] = useState(false);
  const [tempLogo, setTempLogo] = useState('');

  const [isEditingPrimary, setIsEditingPrimary] = useState(false);
  const [tempPrimary, setTempPrimary] = useState('');

  const [isEditingSecondary, setIsEditingSecondary] = useState(false);
  const [tempSecondary, setTempSecondary] = useState('');

  useEffect(() => {
    if (!isConnected || !orgId) return;

    wsService.emit('get_data', { type: 'organization', id: orgId }, (res: any) => {
      if (res) {
        setOrgName(res.name || '');
        setShortName(res.shortName || '');
        setPrimaryColor(res.primaryColor || '#FF3E00');
        setSecondaryColor(res.secondaryColor || '#00E5FF');
        setLogo(res.logo || '');
        setDescription(res.description || '');
      }
      setIsLoading(false);
    });
  }, [isConnected, orgId]);

  const startEditingName = () => {
    setTempName(orgName);
    setIsEditingName(true);
  };
  const saveNameEdit = () => {
    if (tempName.trim()) {
      setOrgName(tempName.trim());
    }
    setIsEditingName(false);
  };

  const startEditingShortName = () => {
    setTempShortName(shortName);
    setIsEditingShortName(true);
  };
  const saveShortNameEdit = () => {
    setShortName(tempShortName.trim());
    setIsEditingShortName(false);
  };

  const startEditingDescription = () => {
    setTempDescription(description);
    setIsEditingDescription(true);
  };
  const saveDescriptionEdit = () => {
    setDescription(tempDescription.trim());
    setIsEditingDescription(false);
  };

  const startEditingLogo = () => {
    setTempLogo(logo);
    setIsEditingLogo(true);
  };
  const saveLogoEdit = () => {
    setLogo(tempLogo.trim());
    setIsEditingLogo(false);
  };

  const startEditingPrimary = () => {
    setTempPrimary(primaryColor);
    setIsEditingPrimary(true);
  };
  const savePrimaryEdit = () => {
    let val = tempPrimary.trim();
    if (val && !val.startsWith('#')) val = '#' + val;
    setPrimaryColor(val);
    setIsEditingPrimary(false);
  };

  const startEditingSecondary = () => {
    setTempSecondary(secondaryColor);
    setIsEditingSecondary(true);
  };
  const saveSecondaryEdit = () => {
    let val = tempSecondary.trim();
    if (val && !val.startsWith('#')) val = '#' + val;
    setSecondaryColor(val);
    setIsEditingSecondary(false);
  };

  const handleSave = () => {
    setIsSaving(true);
    
    const payload = {
      id: orgId,
      data: {
        name: orgName.trim(),
        shortName: shortName.trim(),
        primaryColor: primaryColor.trim(),
        secondaryColor: secondaryColor.trim(),
        logo: logo.trim(),
        description: description.trim(),
      }
    };

    wsService.emit('action', { type: SocketAction.UPDATE_ORG, payload }, (res: any) => {
      setIsSaving(false);
      if (res && res.status !== 'error') {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        console.error('Failed to update organization');
      }
    });
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-slate-50 dark:bg-slate-950 items-center justify-center">
        <ActivityIndicator size="large" color="#FF3E00" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Title Section */}
        <View className="mb-6">
          <Text className="font-orbitron-bold text-xl text-slate-800 dark:text-white uppercase mb-1">
            Branding & Profile Settings
          </Text>
          <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
            Customize the organization profile details, branding colors, logo crest, and preview scoreboard feed representation in real time.
          </Text>
        </View>

        {saveSuccess && (
          <GlassCard className="bg-emerald-500 bg-opacity-10 border border-emerald-500 border-opacity-20 p-4 mb-6 flex-row items-center gap-3 rounded-xl">
            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            <Text className="font-inter-bold text-xs text-emerald-600 dark:text-emerald-400">
              Settings saved successfully!
            </Text>
          </GlassCard>
        )}

        {/* Social Profile Header Banner */}
        <View className="relative mb-6">
          <View 
            className="h-36 w-full rounded-2xl overflow-hidden shadow-sm justify-center pl-2 pr-6"
            style={{ backgroundColor: primaryColor || '#FF3E00' }}
          >
            {/* Secondary color accent shapes inside banner */}
            <View 
              className="absolute -right-10 -bottom-10 w-32 h-32 rounded-full opacity-40"
              style={{ backgroundColor: secondaryColor || '#00E5FF' }}
            />
            <View 
              className="absolute -left-6 -top-6 w-20 h-20 rounded-full opacity-20"
              style={{ backgroundColor: secondaryColor || '#00E5FF' }}
            />

            {/* Squircle Logo Crest centered vertically on the left (Floating Style) */}
            <TouchableOpacity 
              onPress={startEditingLogo}
              className="w-32 h-32 rounded-3xl items-center justify-center overflow-hidden shadow-2xl relative border bg-white bg-opacity-15 border-white border-opacity-20 dark:bg-slate-950 dark:bg-opacity-20 dark:border-white dark:border-opacity-10"
              activeOpacity={0.9}
            >
              {logo ? (
                <Image source={{ uri: logo }} className="w-full h-full object-cover" />
              ) : (
                <View className="w-full h-full items-center justify-center bg-slate-100 bg-opacity-10 dark:bg-slate-800 dark:bg-opacity-10">
                  <Ionicons name="business" size={56} color={getContrastColor(primaryColor)} />
                </View>
              )}
              
              {/* Floating edit badge */}
              <View className="absolute bottom-1.5 right-1.5 bg-brand-orange w-6 h-6 rounded-full items-center justify-center border border-white dark:border-slate-900 shadow-md">
                <Ionicons name="pencil-sharp" size={10} color="white" />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* PROFILE FIELD SECTION (BELOW BANNER) */}
        <View className="space-y-5 mb-6">
          {/* Organization Name Field */}
          <View>
            <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">
              Organization Name
            </Text>
            {isEditingName ? (
              <TextInput
                value={tempName}
                onChangeText={setTempName}
                onBlur={saveNameEdit}
                onSubmitEditing={saveNameEdit}
                autoFocus
                className="font-orbitron-bold text-lg text-slate-800 dark:text-white bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5"
              />
            ) : (
              <TouchableOpacity 
                onPress={startEditingName}
                className="flex-row items-center gap-2.5 py-2 px-3 rounded-xl border border-transparent bg-slate-100 bg-opacity-30 dark:bg-white dark:bg-opacity-5"
              >
                <Text className="font-orbitron-bold text-lg text-slate-800 dark:text-white uppercase tracking-wide flex-1">
                  {orgName || 'Tap to add name'}
                </Text>
                <Ionicons name="create-outline" size={16} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          {/* Combined Row: Abbreviation & Brand Colors */}
          <View className="flex-row items-center gap-6 flex-wrap">
            {/* Short Name / Abbreviation Field */}
            <View style={{ flex: 1 }} className="min-w-[150px]">
              <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">
                Abbreviation
              </Text>
              {isEditingShortName ? (
                <TextInput
                  value={tempShortName}
                  onChangeText={setTempShortName}
                  onBlur={saveShortNameEdit}
                  onSubmitEditing={saveShortNameEdit}
                  maxLength={6}
                  autoFocus
                  className="font-orbitron-bold text-sm text-slate-800 dark:text-white bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white dark:border-opacity-5 rounded-xl px-4 py-2"
                />
              ) : (
                <TouchableOpacity 
                  onPress={startEditingShortName}
                  className="flex-row items-center gap-2 px-3 py-2 rounded-xl border border-transparent bg-slate-100 bg-opacity-30 dark:bg-white dark:bg-opacity-5 self-start"
                >
                  <View className="px-2.5 py-0.5 rounded-md border bg-slate-200 border-slate-300 border-opacity-50 dark:bg-white dark:bg-opacity-10 dark:border-white dark:border-opacity-5">
                    <Text className="font-orbitron-bold text-[10px] text-slate-700 dark:text-slate-300 uppercase tracking-widest">
                      {shortName || 'SHORT'}
                    </Text>
                  </View>
                  <Ionicons name="create-outline" size={14} color="#94A3B8" className="ml-1" />
                </TouchableOpacity>
              )}
            </View>

            {/* Brand Colors Selector */}
            <View style={{ flex: 2 }} className="min-w-[280px]">
              <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">
                Brand Colors
              </Text>
              
              <View className="flex-row gap-4">
                {/* Primary Color Swatch */}
                <TouchableOpacity 
                  onPress={startEditingPrimary}
                  className="flex-1 flex-row items-center gap-2 border border-transparent rounded-xl p-2 bg-slate-100 bg-opacity-20 dark:bg-white dark:bg-opacity-5"
                >
                  <View className="w-8 h-8 rounded-lg border border-slate-300 dark:border-white dark:border-opacity-10" style={{ backgroundColor: primaryColor }} />
                  <View className="flex-1">
                    <Text className="font-orbitron-bold text-[8px] text-slate-400 dark:text-slate-500 uppercase">Primary</Text>
                    <Text className="font-mono text-[10px] text-slate-800 dark:text-white uppercase mt-0.5">{primaryColor}</Text>
                  </View>
                  <Ionicons name="create-outline" size={12} color="#94A3B8" />
                </TouchableOpacity>

                {/* Secondary Color Swatch */}
                <TouchableOpacity 
                  onPress={startEditingSecondary}
                  className="flex-1 flex-row items-center gap-2 border border-transparent rounded-xl p-2 bg-slate-100 bg-opacity-20 dark:bg-white dark:bg-opacity-5"
                >
                  <View className="w-8 h-8 rounded-lg border border-slate-300 dark:border-white dark:border-opacity-10" style={{ backgroundColor: secondaryColor }} />
                  <View className="flex-1">
                    <Text className="font-orbitron-bold text-[8px] text-slate-400 dark:text-slate-500 uppercase">Secondary</Text>
                    <Text className="font-mono text-[10px] text-slate-800 dark:text-white uppercase mt-0.5">{secondaryColor}</Text>
                  </View>
                  <Ionicons name="create-outline" size={12} color="#94A3B8" />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Description / Biography Field */}
          <View>
            <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">
              Description / Biography
            </Text>
            {isEditingDescription ? (
              <TextInput
                value={tempDescription}
                onChangeText={setTempDescription}
                onBlur={saveDescriptionEdit}
                onSubmitEditing={saveDescriptionEdit}
                multiline
                numberOfLines={3}
                autoFocus
                className="font-inter text-sm text-slate-800 dark:text-white bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white dark:border-opacity-5 rounded-xl px-4 py-2.5 min-h-[80px]"
              />
            ) : (
              <TouchableOpacity 
                onPress={startEditingDescription}
                className="flex-row items-start gap-3 py-2 px-3 rounded-xl border border-transparent min-h-[50px] bg-slate-100 bg-opacity-30 dark:bg-white dark:bg-opacity-5"
              >
                <Text className={`font-inter text-xs flex-grow leading-relaxed ${description ? 'text-slate-600 dark:text-slate-400' : 'text-slate-400 dark:text-slate-500 italic'}`}>
                  {description || 'Tap to add organization description... This biography will be displayed on the public organization detail profile.'}
                </Text>
                <Ionicons name="create-outline" size={16} color="#94A3B8" className="mt-0.5" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* MOCK SCOREBOARD PREVIEW */}
        <View className="mb-6">
          <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
            Live Feed Display Mockup
          </Text>
          
          <View className="bg-white dark:bg-slate-900 border border-slate-200 border-opacity-50 dark:border-white dark:border-opacity-5 rounded-2xl p-4 shadow-sm">
            {/* Mock Scoreboard Header */}
            <View className="flex-row justify-between items-center mb-3 pb-2 border-b border-slate-200 border-opacity-50 dark:border-white dark:border-opacity-5">
              <View className="flex-row items-center gap-2">
                {logo ? (
                  <Image source={{ uri: logo }} className="w-4 h-4 rounded-full" />
                ) : (
                  <View className="w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center">
                    <Ionicons name="business" size={9} color={primaryColor || "#FF3E00"} />
                  </View>
                )}
                <Text className="font-orbitron-bold text-[9px] text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  {shortName || orgName || 'ORG'}
                </Text>
              </View>
              <View className="flex-row items-center gap-1">
                <View className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <Text className="font-inter-bold text-[8px] text-emerald-500 uppercase tracking-widest">LIVE</Text>
              </View>
            </View>

            {/* Mock Scoreboard Teams */}
            <View className="flex-row justify-between items-center py-1">
              <View className="flex-1">
                <Text className="font-inter-bold text-xs text-slate-800 dark:text-white">Home Team</Text>
                <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500">Host</Text>
              </View>
              
              <View className="flex-row items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: hexToRgba(primaryColor, 0.08) }}>
                <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white">4</Text>
                <Text className="font-inter text-slate-400 dark:text-slate-500 text-[10px]">-</Text>
                <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white">2</Text>
              </View>
              
              <View className="flex-1 items-end">
                <Text className="font-inter-bold text-xs text-slate-800 dark:text-white">Away Team</Text>
                <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500">Visitor</Text>
              </View>
            </View>

            {/* Mock Scoreboard Button */}
            <View 
              className="mt-4 py-2.5 rounded-xl items-center justify-center active:opacity-90 shadow-sm"
              style={{ backgroundColor: primaryColor || '#FF3E00' }}
            >
              <Text 
                className="font-orbitron-bold text-[10px] uppercase tracking-widest"
                style={{ color: getContrastColor(primaryColor) }}
              >
                View Match Centre
              </Text>
            </View>
          </View>
        </View>

        {/* Global Save Button */}
        <Button
          title="Save Branding Profile"
          variant="primary"
          onPress={handleSave}
          isLoading={isSaving}
          className="w-full shadow-md shadow-brand-orange/20 py-3.5 rounded-xl"
        />
      </ScrollView>

      {/* OVERLAY MODAL: EDIT LOGO URL */}
      {isEditingLogo && (
        <View className="absolute inset-0 bg-slate-950 bg-opacity-75 items-center justify-center z-50 p-6">
          <GlassCard className="w-full max-w-md border border-slate-200 dark:border-white dark:border-opacity-10 p-6 space-y-4 shadow-2xl">
            <Text className="font-orbitron-bold text-xs text-slate-800 dark:text-white uppercase mb-2 tracking-wider">
              Edit Logo Image URL
            </Text>
            <TextInput
              value={tempLogo}
              onChangeText={setTempLogo}
              placeholder="e.g. https://domain.com/logo.png"
              placeholderTextColor="#94A3B8"
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white dark:border-opacity-5 rounded-xl px-4 py-3 font-inter text-sm text-slate-800 dark:text-white w-full"
              autoFocus
            />
            <View className="flex-row gap-3 mt-4">
              <TouchableOpacity 
                onPress={() => setIsEditingLogo(false)}
                className="flex-1 py-3 bg-slate-100 dark:bg-white dark:bg-opacity-10 rounded-xl items-center justify-center border border-slate-200 dark:border-white dark:border-opacity-5"
              >
                <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-300 uppercase">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={saveLogoEdit}
                className="flex-1 py-3 bg-brand-orange rounded-xl items-center justify-center"
              >
                <Text className="font-inter-bold text-xs text-white uppercase">Apply</Text>
              </TouchableOpacity>
            </View>
          </GlassCard>
        </View>
      )}

      {/* OVERLAY MODAL: EDIT PRIMARY COLOR */}
      {isEditingPrimary && (
        <View className="absolute inset-0 bg-slate-950 bg-opacity-75 items-center justify-center z-50 p-6">
          <GlassCard className="w-full max-w-md border border-slate-200 dark:border-white dark:border-opacity-10 p-6 space-y-4 shadow-2xl">
            <Text className="font-orbitron-bold text-xs text-slate-800 dark:text-white uppercase mb-2 tracking-wider">
              Edit Primary Color (Hex)
            </Text>
            <TextInput
              value={tempPrimary}
              onChangeText={setTempPrimary}
              placeholder="#FF3E00"
              placeholderTextColor="#94A3B8"
              maxLength={7}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white dark:border-opacity-5 rounded-xl px-4 py-3 font-mono text-sm text-slate-800 dark:text-white w-full"
              autoFocus
            />
            <View className="flex-row gap-3 mt-4">
              <TouchableOpacity 
                onPress={() => setIsEditingPrimary(false)}
                className="flex-1 py-3 bg-slate-100 dark:bg-white dark:bg-opacity-10 rounded-xl items-center justify-center border border-slate-200 dark:border-white dark:border-opacity-5"
              >
                <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-300 uppercase">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={savePrimaryEdit}
                className="flex-1 py-3 bg-brand-orange rounded-xl items-center justify-center"
              >
                <Text className="font-inter-bold text-xs text-white uppercase">Apply</Text>
              </TouchableOpacity>
            </View>
          </GlassCard>
        </View>
      )}

      {/* OVERLAY MODAL: EDIT SECONDARY COLOR */}
      {isEditingSecondary && (
        <View className="absolute inset-0 bg-slate-950 bg-opacity-75 items-center justify-center z-50 p-6">
          <GlassCard className="w-full max-w-md border border-slate-200 dark:border-white dark:border-opacity-10 p-6 space-y-4 shadow-2xl">
            <Text className="font-orbitron-bold text-xs text-slate-800 dark:text-white uppercase mb-2 tracking-wider">
              Edit Secondary Color (Hex)
            </Text>
            <TextInput
              value={tempSecondary}
              onChangeText={setTempSecondary}
              placeholder="#00E5FF"
              placeholderTextColor="#94A3B8"
              maxLength={7}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white dark:border-opacity-5 rounded-xl px-4 py-3 font-mono text-sm text-slate-800 dark:text-white w-full"
              autoFocus
            />
            <View className="flex-row gap-3 mt-4">
              <TouchableOpacity 
                onPress={() => setIsEditingSecondary(false)}
                className="flex-1 py-3 bg-slate-100 dark:bg-white dark:bg-opacity-10 rounded-xl items-center justify-center border border-slate-200 dark:border-white dark:border-opacity-5"
              >
                <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-300 uppercase">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={saveSecondaryEdit}
                className="flex-1 py-3 bg-brand-orange rounded-xl items-center justify-center"
              >
                <Text className="font-inter-bold text-xs text-white uppercase">Apply</Text>
              </TouchableOpacity>
            </View>
          </GlassCard>
        </View>
      )}
    </View>
  );
}
