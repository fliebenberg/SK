import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Image, useWindowDimensions, Platform, KeyboardAvoidingView, PanResponder } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { GlassCard } from '../../../../components/GlassCard';
import { Button } from '../../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../../../store/settingsStore';
import { wsService } from '../../../../services/websocket';
import { useWsStore } from '../../../../store/wsStore';
import { SocketAction } from '@sk/types';
import * as ImagePicker from 'expo-image-picker';
import { CONSTANTS } from '../../../../constants';
import { getOrgLogoUrl } from '../../../../services/api';
import { OrgLogo } from '../../../../components/OrgLogo';

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

function hslToHex(h: number, s: number, l: number): string {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  let r = 0, g = 0, b = 0;
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(char => char + char).join('');
  }
  if (cleanHex.length === 6) {
    r = parseInt(cleanHex.substring(0, 2), 16) / 255;
    g = parseInt(cleanHex.substring(2, 4), 16) / 255;
    b = parseInt(cleanHex.substring(4, 6), 16) / 255;
  }
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

interface BaseHue {
  name: string;
  h: number;
  s: number;
  l: number;
  isGrey?: boolean;
}

const BASE_HUES: BaseHue[] = [
  { name: 'Red', h: 0, s: 95, l: 50 },
  { name: 'Orange', h: 24, s: 95, l: 50 },
  { name: 'Yellow', h: 45, s: 95, l: 50 },
  { name: 'Green', h: 120, s: 75, l: 45 },
  { name: 'Teal', h: 170, s: 85, l: 40 },
  { name: 'Blue', h: 210, s: 90, l: 50 },
  { name: 'Purple', h: 270, s: 80, l: 55 },
  { name: 'Pink', h: 330, s: 85, l: 50 },
  { name: 'Grey', h: 0, s: 0, l: 50, isGrey: true }
];

const getShades = (hue: number, isGrey?: boolean) => {
  if (isGrey) {
    return [
      '#F8FAFC',
      '#F1F5F9',
      '#CBD5E1',
      '#94A3B8',
      '#64748B',
      '#475569',
      '#1E293B',
      '#0F172A',
    ];
  }
  return [
    hslToHex(hue, 95, 90),
    hslToHex(hue, 95, 75),
    hslToHex(hue, 95, 62),
    hslToHex(hue, 95, 50),
    hslToHex(hue, 95, 42),
    hslToHex(hue, 95, 32),
    hslToHex(hue, 95, 22),
    hslToHex(hue, 45, 50),
  ];
};

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

  const [logoConfig, setLogoConfig] = useState({ scale: 1, x: 0, y: 0 });
  const [settings, setSettings] = useState<Record<string, any>>({});
  
  // Temp logo states for the editor modal
  const [isEditingLogo, setIsEditingLogo] = useState(false);
  const [tempLogo, setTempLogo] = useState('');
  const [tempScale, setTempScale] = useState(1);
  const [tempX, setTempX] = useState(0); // Normalized -1 to 1
  const [tempY, setTempY] = useState(0); // Normalized -1 to 1
  const [nudgeSpeed, setNudgeSpeed] = useState(0.02); // 2% nudge by default



  // Refs for hidden inputs on web
  const primaryInputRef = useRef<any>(null);
  const secondaryInputRef = useRef<any>(null);

  // Overlay modal states
  const [isEditingPrimary, setIsEditingPrimary] = useState(false);
  const [tempPrimary, setTempPrimary] = useState('');
  const [primaryHue, setPrimaryHue] = useState(0);
  const [isPrimaryGrey, setIsPrimaryGrey] = useState(false);

  const [isEditingSecondary, setIsEditingSecondary] = useState(false);
  const [tempSecondary, setTempSecondary] = useState('');
  const [secondaryHue, setSecondaryHue] = useState(0);
  const [isSecondaryGrey, setIsSecondaryGrey] = useState(false);

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
        
        // Load settings and logoConfig
        const orgSettings = res.settings || {};
        setSettings(orgSettings);
        setLogoConfig(orgSettings.logoConfig || { scale: 1, x: 0, y: 0 });
      }
      setIsLoading(false);
    });

    const room = `org:${orgId}:summary`;
    const unsubscribe = wsService.subscribeToRoom(room);

    const handleUpdate = (event: any) => {
      if (event && event.type === 'ORGANIZATION_UPDATED') {
        if (event.data && event.data.id === orgId) {
          setOrgName(event.data.name || '');
          setShortName(event.data.shortName || '');
          setPrimaryColor(event.data.primaryColor || '#FF3E00');
          setSecondaryColor(event.data.secondaryColor || '#00E5FF');
          setLogo(event.data.logo || '');
          setDescription(event.data.description || '');
          
          const orgSettings = event.data.settings || {};
          setSettings(orgSettings);
          setLogoConfig(orgSettings.logoConfig || { scale: 1, x: 0, y: 0 });
        }
      }
    };

    wsService.on('update', handleUpdate);

    return () => {
      unsubscribe();
      wsService.off('update', handleUpdate);
    };
  }, [isConnected, orgId]);



  const handlePickLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alert('We need camera roll permissions to change the organization logo.');
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0].base64) {
        const asset = result.assets[0];
        const mime = asset.mimeType || 'image/png';
        const base64Str = `data:${mime};base64,${asset.base64}`;
        setLogo(base64Str);
      }
    } catch (err) {
      console.error('[Branding] Error picking logo image:', err);
      alert('Failed to process selected logo image');
    }
  };

  // PanResponder to handle dragging and pinching inside the preview
  const initialPinchDist = useRef<number | null>(null);
  const initialPinchScale = useRef<number>(1);
  const dragStartX = useRef<number>(0);
  const dragStartY = useRef<number>(0);
  const previewContainerRef = useRef<any>(null);

  const tempScaleRef = useRef(1);
  const tempXRef = useRef(0);
  const tempYRef = useRef(0);
  
  // Sync refs when states change
  useEffect(() => {
    tempScaleRef.current = tempScale;
  }, [tempScale]);
  useEffect(() => {
    tempXRef.current = tempX;
  }, [tempX]);
  useEffect(() => {
    tempYRef.current = tempY;
  }, [tempY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        initialPinchDist.current = null;
        dragStartX.current = tempXRef.current;
        dragStartY.current = tempYRef.current;
      },
      onPanResponderMove: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;
        
        if (touches.length === 2) {
          // Pinch-to-zoom
          const touch1 = touches[0];
          const touch2 = touches[1];
          const dx = touch1.pageX - touch2.pageX;
          const dy = touch1.pageY - touch2.pageY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (initialPinchDist.current === null) {
            initialPinchDist.current = dist;
            initialPinchScale.current = tempScaleRef.current;
          } else {
            const factor = dist / initialPinchDist.current;
            const newScale = Math.max(0.5, Math.min(3.0, initialPinchScale.current * factor));
            setTempScale(newScale);
          }
        } else if (touches.length === 1) {
          // Drag-to-position
          const containerSize = 144;
          const newX = dragStartX.current + (gestureState.dx / containerSize);
          const newY = dragStartY.current + (gestureState.dy / containerSize);
          
          setTempX(Math.max(-1, Math.min(1, newX)));
          setTempY(Math.max(-1, Math.min(1, newY)));
        }
      }
    })
  ).current;

  // Add scroll listener on web to support wheel zooming
  useEffect(() => {
    if (!isEditingLogo) return;
    
    const element = previewContainerRef.current;
    if (!element) return;
    
    const handleWheelEvent = (e: WheelEvent) => {
      e.preventDefault();
      const step = 0.05;
      const zoomIn = e.deltaY < 0;
      setTempScale(prev => {
        const next = zoomIn ? prev + step : prev - step;
        return Math.max(0.5, Math.min(3.0, next));
      });
    };
    
    if (Platform.OS === 'web' && element.addEventListener) {
      element.addEventListener('wheel', handleWheelEvent, { passive: false });
      return () => {
        element.removeEventListener('wheel', handleWheelEvent);
      };
    }
  }, [isEditingLogo]);

  const handleOpenLogoEditor = () => {
    setTempLogo(logo);
    setTempScale(logoConfig.scale ?? 1);
    setTempX(logoConfig.x ?? 0);
    setTempY(logoConfig.y ?? 0);
    setIsEditingLogo(true);
  };

  const handleChooseImageForTempLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alert('We need camera roll permissions to change the organization logo.');
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0].base64) {
        const asset = result.assets[0];
        const mime = asset.mimeType || 'image/png';
        const base64Str = `data:${mime};base64,${asset.base64}`;
        setTempLogo(base64Str);
      }
    } catch (err) {
      console.error('[Branding] Error picking logo image:', err);
      alert('Failed to process selected logo image');
    }
  };

  const handleApplyLogoConfig = () => {
    setLogo(tempLogo);
    const newConfig = { scale: tempScale, x: tempX, y: tempY };
    setLogoConfig(newConfig);
    setSettings((prev) => ({
      ...prev,
      logoConfig: newConfig,
    }));
    setIsEditingLogo(false);
  };

  const handleOpenEyedropper = async (colorType: 'primary' | 'secondary') => {
    if (typeof window !== 'undefined' && 'EyeDropper' in window) {
      try {
        const eyeDropper = new (window as any).EyeDropper();
        const result = await eyeDropper.open();
        if (result && result.sRGBHex) {
          const hex = result.sRGBHex;
          if (colorType === 'primary') {
            setTempPrimary(hex);
          } else {
            setTempSecondary(hex);
          }
        }
      } catch (err) {
        console.log('[Eyedropper] Closed or failed:', err);
      }
    }
  };

  const startEditingPrimary = () => {
    setTempPrimary(primaryColor);
    const hsl = hexToHsl(primaryColor);
    setPrimaryHue(hsl.h);
    setIsPrimaryGrey(hsl.s === 0);
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
    const hsl = hexToHsl(secondaryColor);
    setSecondaryHue(hsl.h);
    setIsSecondaryGrey(hsl.s === 0);
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
        settings: {
          ...settings,
          logoConfig: logoConfig
        }
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
    <KeyboardAvoidingView
      behavior="padding"
      style={{ flex: 1 }}
      keyboardVerticalOffset={CONSTANTS.LAYOUT.keyboardVerticalOffset}
    >
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
              onPress={handleOpenLogoEditor}
              className="w-32 h-32 rounded-3xl items-center justify-center overflow-hidden shadow-2xl relative border bg-white bg-opacity-15 border-white border-opacity-20 dark:bg-slate-950 dark:bg-opacity-20 dark:border-white dark:border-opacity-10"
              activeOpacity={0.9}
            >
              {logo ? (
                <OrgLogo logo={logo} settings={{ ...settings, logoConfig }} size={128} />
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
            <TextInput
              value={orgName}
              onChangeText={setOrgName}
              placeholder="Enter organization name"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              className="font-orbitron-bold text-lg text-slate-800 dark:text-white bg-slate-100 bg-opacity-30 dark:bg-white dark:bg-opacity-5 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5"
            />
          </View>
 
          {/* Combined Row: Abbreviation & Brand Colors */}
          <View className="flex-row items-center gap-6 flex-wrap">
            {/* Short Name / Abbreviation Field */}
            <View style={{ flex: 1 }} className="min-w-[150px]">
              <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">
                Abbreviation
              </Text>
              <TextInput
                value={shortName}
                onChangeText={setShortName}
                maxLength={6}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                placeholder="SHORT"
                placeholderTextColor="#94A3B8"
                className="font-orbitron-bold text-lg text-slate-800 dark:text-white bg-slate-100 bg-opacity-30 dark:bg-white dark:bg-opacity-5 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 w-36 text-center"
              />
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
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              placeholder="Enter organization description... This biography will be displayed on the public organization detail profile."
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              className="font-inter text-sm text-slate-800 dark:text-white bg-slate-100 bg-opacity-30 dark:bg-white dark:bg-opacity-5 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 min-h-[80px]"
            />
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
                  <OrgLogo logo={logo} settings={{ ...settings, logoConfig }} size={16} className="rounded-full" />
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

      {/* OVERLAY MODAL: EDIT PRIMARY COLOR */}
      {isEditingPrimary && (
        <View className="absolute inset-0 bg-slate-950 bg-opacity-75 items-center justify-center z-50 p-6">
          <GlassCard className="w-full max-w-md border border-slate-200 dark:border-white dark:border-opacity-10 p-6 space-y-4 shadow-2xl">
            <Text className="font-orbitron-bold text-xs text-slate-800 dark:text-white uppercase mb-2 tracking-wider">
              Edit Primary Color
            </Text>
            
            {/* Hidden Input for Web Native Color Picker */}
            {Platform.OS === 'web' && (
              <input
                ref={primaryInputRef}
                type="color"
                value={tempPrimary || '#FFFFFF'}
                onChange={(e) => setTempPrimary(e.target.value)}
                style={{ position: 'absolute', width: 0, height: 0, opacity: 0, border: 'none', padding: 0 }}
              />
            )}

            {/* Interactive Color Swatch to Open Spectrum Picker */}
            <TouchableOpacity
              onPress={() => {
                if (Platform.OS === 'web') {
                  primaryInputRef.current?.click();
                }
              }}
              activeOpacity={0.8}
              className="w-full h-24 rounded-2xl items-center justify-center border border-slate-200 dark:border-white/10 shadow-sm relative overflow-hidden"
              style={{ backgroundColor: tempPrimary || '#FFFFFF' }}
            >
              <Text 
                className="font-orbitron-bold text-xs uppercase px-3 py-1.5 rounded-full bg-black/40 text-white text-center"
                style={{ color: '#ffffff' }}
              >
                {Platform.OS === 'web' ? 'Tap swatch to open spectrum picker' : 'Primary Color Preview'}
              </Text>
            </TouchableOpacity>

            <View className="flex-row items-center gap-3 w-full">
              <TextInput
                value={tempPrimary}
                onChangeText={(text) => {
                  let val = text;
                  if (val && !val.startsWith('#')) val = '#' + val;
                  val = val.substring(0, 7);
                  setTempPrimary(val);
                }}
                placeholder="#FF3E00"
                placeholderTextColor="#94A3B8"
                maxLength={7}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-mono text-sm text-slate-800 dark:text-white flex-grow"
              />
              
              {Platform.OS === 'web' && typeof window !== 'undefined' && 'EyeDropper' in window && (
                <TouchableOpacity
                  onPress={() => handleOpenEyedropper('primary')}
                  className="bg-slate-100 dark:bg-white/10 border border-slate-200 dark:border-white/5 rounded-xl p-3 items-center justify-center active:scale-95"
                >
                  <Ionicons name="color-palette-outline" size={20} color={isDark ? "white" : "#0F172A"} />
                </TouchableOpacity>
              )}
            </View>

            {/* HSL base hue picker row */}
            <View className="space-y-2">
              <Text className="font-orbitron-bold text-[8px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Base Hue
              </Text>
              <View className="flex-row justify-between items-center gap-1.5 flex-wrap">
                {BASE_HUES.map((hue) => (
                  <TouchableOpacity
                    key={hue.name}
                    onPress={() => {
                      setPrimaryHue(hue.h);
                      setIsPrimaryGrey(!!hue.isGrey);
                      const baseColor = hslToHex(hue.h, hue.s, hue.l);
                      setTempPrimary(baseColor);
                    }}
                    className={`w-7 h-7 rounded-full border items-center justify-center active:scale-95 ${
                      (primaryHue === hue.h && isPrimaryGrey === !!hue.isGrey)
                        ? 'border-brand-orange border-2 scale-105 shadow-md'
                        : 'border-slate-200 dark:border-white/10'
                    }`}
                    style={{ backgroundColor: hslToHex(hue.h, hue.s, hue.l) }}
                  />
                ))}
              </View>
            </View>

            {/* Dynamic shade selector */}
            <View className="space-y-2 pt-1">
              <Text className="font-orbitron-bold text-[8px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Select Shade
              </Text>
              <View className="flex-row justify-between items-center gap-1.5 flex-wrap">
                {getShades(primaryHue, isPrimaryGrey).map((shade, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => setTempPrimary(shade)}
                    className={`w-7 h-7 rounded-lg border items-center justify-center active:scale-95 ${
                      tempPrimary.toUpperCase() === shade.toUpperCase()
                        ? 'border-brand-orange border-2 scale-105 shadow-md'
                        : 'border-slate-200 dark:border-white/10'
                    }`}
                    style={{ backgroundColor: shade }}
                  />
                ))}
              </View>
            </View>

            <View className="flex-row gap-3 mt-4">
              <TouchableOpacity 
                onPress={() => setIsEditingPrimary(false)}
                className="flex-1 py-3 bg-slate-100 dark:bg-white dark:bg-opacity-10 rounded-xl items-center justify-center border border-slate-200 dark:border-white/5"
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
              Edit Secondary Color
            </Text>
            
            {/* Hidden Input for Web Native Color Picker */}
            {Platform.OS === 'web' && (
              <input
                ref={secondaryInputRef}
                type="color"
                value={tempSecondary || '#FFFFFF'}
                onChange={(e) => setTempSecondary(e.target.value)}
                style={{ position: 'absolute', width: 0, height: 0, opacity: 0, border: 'none', padding: 0 }}
              />
            )}

            {/* Interactive Color Swatch to Open Spectrum Picker */}
            <TouchableOpacity
              onPress={() => {
                if (Platform.OS === 'web') {
                  secondaryInputRef.current?.click();
                }
              }}
              activeOpacity={0.8}
              className="w-full h-24 rounded-2xl items-center justify-center border border-slate-200 dark:border-white/10 shadow-sm relative overflow-hidden"
              style={{ backgroundColor: tempSecondary || '#FFFFFF' }}
            >
              <Text 
                className="font-orbitron-bold text-xs uppercase px-3 py-1.5 rounded-full bg-black/40 text-white text-center"
                style={{ color: '#ffffff' }}
              >
                {Platform.OS === 'web' ? 'Tap swatch to open spectrum picker' : 'Secondary Color Preview'}
              </Text>
            </TouchableOpacity>

            <View className="flex-row items-center gap-3 w-full">
              <TextInput
                value={tempSecondary}
                onChangeText={(text) => {
                  let val = text;
                  if (val && !val.startsWith('#')) val = '#' + val;
                  val = val.substring(0, 7);
                  setTempSecondary(val);
                }}
                placeholder="#00E5FF"
                placeholderTextColor="#94A3B8"
                maxLength={7}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-mono text-sm text-slate-800 dark:text-white flex-grow"
              />
              
              {Platform.OS === 'web' && typeof window !== 'undefined' && 'EyeDropper' in window && (
                <TouchableOpacity
                  onPress={() => handleOpenEyedropper('secondary')}
                  className="bg-slate-100 dark:bg-white/10 border border-slate-200 dark:border-white/5 rounded-xl p-3 items-center justify-center active:scale-95"
                >
                  <Ionicons name="color-palette-outline" size={20} color={isDark ? "white" : "#0F172A"} />
                </TouchableOpacity>
              )}
            </View>

            {/* HSL base hue picker row */}
            <View className="space-y-2">
              <Text className="font-orbitron-bold text-[8px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Base Hue
              </Text>
              <View className="flex-row justify-between items-center gap-1.5 flex-wrap">
                {BASE_HUES.map((hue) => (
                  <TouchableOpacity
                    key={hue.name}
                    onPress={() => {
                      setSecondaryHue(hue.h);
                      setIsSecondaryGrey(!!hue.isGrey);
                      const baseColor = hslToHex(hue.h, hue.s, hue.l);
                      setTempSecondary(baseColor);
                    }}
                    className={`w-7 h-7 rounded-full border items-center justify-center active:scale-95 ${
                      (secondaryHue === hue.h && isSecondaryGrey === !!hue.isGrey)
                        ? 'border-brand-orange border-2 scale-105 shadow-md'
                        : 'border-slate-200 dark:border-white/10'
                    }`}
                    style={{ backgroundColor: hslToHex(hue.h, hue.s, hue.l) }}
                  />
                ))}
              </View>
            </View>

            {/* Dynamic shade selector */}
            <View className="space-y-2 pt-1">
              <Text className="font-orbitron-bold text-[8px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Select Shade
              </Text>
              <View className="flex-row justify-between items-center gap-1.5 flex-wrap">
                {getShades(secondaryHue, isSecondaryGrey).map((shade, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => setTempSecondary(shade)}
                    className={`w-7 h-7 rounded-lg border items-center justify-center active:scale-95 ${
                      tempSecondary.toUpperCase() === shade.toUpperCase()
                        ? 'border-brand-orange border-2 scale-105 shadow-md'
                        : 'border-slate-200 dark:border-white/10'
                    }`}
                    style={{ backgroundColor: shade }}
                  />
                ))}
              </View>
            </View>

            <View className="flex-row gap-3 mt-4">
              <TouchableOpacity 
                onPress={() => setIsEditingSecondary(false)}
                className="flex-1 py-3 bg-slate-100 dark:bg-white dark:bg-opacity-10 rounded-xl items-center justify-center border border-slate-200 dark:border-white/5"
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

      {/* OVERLAY MODAL: EDIT LOGO */}
      {isEditingLogo && (
        <View className="absolute inset-0 bg-slate-950 bg-opacity-75 items-center justify-center z-50 p-6">
          <GlassCard className="w-full max-w-md border border-slate-200 dark:border-white dark:border-opacity-10 p-6 space-y-4 shadow-2xl">
            <Text className="font-orbitron-bold text-xs text-slate-800 dark:text-white uppercase mb-2 tracking-wider">
              Adjust Logo Placement
            </Text>

            {/* Preview Area */}
            <View className="items-center justify-center py-4">
              <View 
                ref={previewContainerRef}
                style={{ width: 144, height: 144, borderRadius: 36, overflow: 'hidden', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}
                className="bg-white dark:bg-slate-950 shadow-lg justify-center items-center relative"
                {...panResponder.panHandlers}
              >
                {tempLogo ? (
                  <Image 
                    source={{ uri: getOrgLogoUrl(tempLogo, 'large') }} 
                    style={{ 
                      width: '100%', 
                      height: '100%',
                      transform: [
                        { scale: tempScale },
                        { translateX: tempX * 144 },
                        { translateY: tempY * 144 }
                      ]
                    }}
                    resizeMode="cover"
                  />
                ) : (
                  <View className="w-full h-full items-center justify-center bg-slate-100 dark:bg-slate-800">
                    <Ionicons name="business" size={64} color={isDark ? "white" : "#64748B"} />
                  </View>
                )}
                
                {tempLogo ? (
                  <View className="absolute bottom-1 bg-black/40 rounded-full px-2 py-0.5 pointer-events-none">
                    <Text className="font-inter text-[8px] text-white">Drag to Move / Scroll to Zoom</Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Choose / Change Image buttons */}
            <View className="flex-row gap-2 justify-center">
              <TouchableOpacity
                onPress={handleChooseImageForTempLogo}
                className="px-4 py-2.5 bg-slate-100 dark:bg-white/10 rounded-xl flex-row items-center gap-2 border border-slate-200 dark:border-white/5 active:scale-95"
              >
                <Ionicons name="image" size={14} color={isDark ? "white" : "#0F172A"} />
                <Text className="font-inter-bold text-xs text-slate-800 dark:text-white">
                  {tempLogo ? 'Change Image' : 'Choose Image'}
                </Text>
              </TouchableOpacity>

              {tempLogo ? (
                <TouchableOpacity
                  onPress={() => {
                    setTempLogo('');
                    setTempScale(1);
                    setTempX(0);
                    setTempY(0);
                  }}
                  className="px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl flex-row items-center gap-2 active:scale-95"
                >
                  <Ionicons name="trash-outline" size={14} color="#EF4444" />
                  <Text className="font-inter-bold text-xs text-red-500">Remove</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {tempLogo ? (
              <View className="space-y-4">
                {/* Zoom Controls */}
                <View className="space-y-1.5">
                  <View className="flex-row justify-between items-center">
                    <Text className="font-orbitron-bold text-[8px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                      Zoom ({tempScale.toFixed(2)}x)
                    </Text>
                    <TouchableOpacity onPress={() => setTempScale(1)}>
                      <Text className="font-orbitron-bold text-[8px] text-brand-orange uppercase">Reset Zoom</Text>
                    </TouchableOpacity>
                  </View>
                  <View className="flex-row items-center gap-3 justify-center">
                    <TouchableOpacity 
                      onPress={() => setTempScale(Math.max(0.5, tempScale - 0.1))} 
                      className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-white/5 items-center justify-center border border-slate-200 dark:border-white/5 active:scale-95"
                    >
                      <Ionicons name="remove" size={18} color={isDark ? "white" : "#0F172A"} />
                    </TouchableOpacity>

                    {/* Pre-set zoom segments */}
                    <View className="flex-row gap-1.5 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl flex-1 justify-around">
                      {[0.75, 1.0, 1.5, 2.0].map((val) => (
                        <TouchableOpacity
                          key={val}
                          onPress={() => setTempScale(val)}
                          className={`px-2 py-1 rounded-lg ${tempScale.toFixed(2) === val.toFixed(2) ? 'bg-brand-orange' : ''}`}
                        >
                          <Text className={`font-orbitron-bold text-[9px] ${tempScale.toFixed(2) === val.toFixed(2) ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                            {val}x
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <TouchableOpacity 
                      onPress={() => setTempScale(Math.min(3.0, tempScale + 0.1))} 
                      className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-white/5 items-center justify-center border border-slate-200 dark:border-white/5 active:scale-95"
                    >
                      <Ionicons name="add" size={18} color={isDark ? "white" : "#0F172A"} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Position Fine Tuning (D-Pad) */}
                <View className="space-y-1.5">
                  <View className="flex-row justify-between items-center">
                    <Text className="font-orbitron-bold text-[8px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                      Position Adjust (X: {Math.round(tempX * 100)}%, Y: {Math.round(tempY * 100)}%)
                    </Text>
                    <TouchableOpacity onPress={() => { setTempX(0); setTempY(0); }}>
                      <Text className="font-orbitron-bold text-[8px] text-brand-orange uppercase">Center Image</Text>
                    </TouchableOpacity>
                  </View>

                  <View className="flex-row justify-between items-center gap-6">
                    {/* D-Pad Controller */}
                    <View className="w-28 h-28 items-center justify-center relative bg-slate-100 dark:bg-slate-950 rounded-full border border-slate-200 dark:border-white/5 p-1">
                      {/* Up */}
                      <TouchableOpacity 
                        onPress={() => setTempY(Math.max(-1, tempY - nudgeSpeed))} 
                        className="absolute top-1.5 w-8 h-8 rounded-full items-center justify-center bg-white dark:bg-white/10 active:scale-95 shadow-sm"
                      >
                        <Ionicons name="chevron-up" size={16} color={isDark ? "white" : "#0F172A"} />
                      </TouchableOpacity>
                      {/* Left */}
                      <TouchableOpacity 
                        onPress={() => setTempX(Math.max(-1, tempX - nudgeSpeed))} 
                        className="absolute left-1.5 w-8 h-8 rounded-full items-center justify-center bg-white dark:bg-white/10 active:scale-95 shadow-sm"
                      >
                        <Ionicons name="chevron-back" size={16} color={isDark ? "white" : "#0F172A"} />
                      </TouchableOpacity>
                      {/* Center Reset */}
                      <TouchableOpacity 
                        onPress={() => { setTempX(0); setTempY(0); }} 
                        className="w-8 h-8 rounded-full items-center justify-center bg-brand-orange active:scale-95 shadow-md shadow-brand-orange/30"
                      >
                        <Ionicons name="contract" size={14} color="white" />
                      </TouchableOpacity>
                      {/* Right */}
                      <TouchableOpacity 
                        onPress={() => setTempX(Math.min(1, tempX + nudgeSpeed))} 
                        className="absolute right-1.5 w-8 h-8 rounded-full items-center justify-center bg-white dark:bg-white/10 active:scale-95 shadow-sm"
                      >
                        <Ionicons name="chevron-forward" size={16} color={isDark ? "white" : "#0F172A"} />
                      </TouchableOpacity>
                      {/* Down */}
                      <TouchableOpacity 
                        onPress={() => setTempY(Math.min(1, tempY + nudgeSpeed))} 
                        className="absolute bottom-1.5 w-8 h-8 rounded-full items-center justify-center bg-white dark:bg-white/10 active:scale-95 shadow-sm"
                      >
                        <Ionicons name="chevron-down" size={16} color={isDark ? "white" : "#0F172A"} />
                      </TouchableOpacity>
                    </View>

                    {/* Step Size Selector */}
                    <View className="flex-1 space-y-1">
                      <Text className="font-orbitron-bold text-[7px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                        Nudge Sensitivity
                      </Text>
                      <View className="space-y-1.5">
                        {[
                          { label: 'Fine (1%)', value: 0.01 },
                          { label: 'Medium (3%)', value: 0.03 },
                          { label: 'Coarse (8%)', value: 0.08 },
                        ].map((item) => (
                          <TouchableOpacity
                            key={item.value}
                            onPress={() => setNudgeSpeed(item.value)}
                            className={`px-3 py-1.5 rounded-lg border text-center ${nudgeSpeed === item.value ? 'bg-brand-orange/10 border-brand-orange/30' : 'border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-950'}`}
                          >
                            <Text className={`font-inter-bold text-[9px] text-center ${nudgeSpeed === item.value ? 'text-brand-orange' : 'text-slate-600 dark:text-slate-400'}`}>
                              {item.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            ) : null}

            {/* Apply / Cancel */}
            <View className="flex-row gap-3 mt-6">
              <TouchableOpacity 
                onPress={() => setIsEditingLogo(false)}
                className="flex-1 py-3 bg-slate-100 dark:bg-white dark:bg-opacity-10 rounded-xl items-center justify-center border border-slate-200 dark:border-white/5 active:scale-98"
              >
                <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-300 uppercase">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={handleApplyLogoConfig}
                className="flex-1 py-3 bg-brand-orange rounded-xl items-center justify-center active:scale-98 shadow-md shadow-brand-orange/20"
              >
                <Text className="font-inter-bold text-xs text-white uppercase">Apply</Text>
              </TouchableOpacity>
            </View>
          </GlassCard>
        </View>
      )}
      </View>
    </KeyboardAvoidingView>
  );
}
