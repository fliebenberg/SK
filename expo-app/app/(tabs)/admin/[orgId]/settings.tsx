import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Image, useWindowDimensions, Platform, KeyboardAvoidingView, PanResponder } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../../components/GlassCard';
import { Button } from '../../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../../../store/settingsStore';
import { wsService } from '../../../../services/websocket';
import { useWsStore } from '../../../../store/wsStore';
import { SocketAction } from '@sk/types';
import * as ImagePicker from 'expo-image-picker';
import { CONSTANTS, getThemeColor } from '../../../../constants';
import { getOrgLogoUrl } from '../../../../services/api';
import { OrgLogo } from '../../../../components/OrgLogo';
import { OrgBrandedCard } from '@/components/OrgBrandedCard';
import { getContrastColor, hexToRgba } from '@/utils/colorUtils';
import { ImageEditor } from '../../../../components/ImageEditor';

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
  const router = useRouter();
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
  
  const [allSports, setAllSports] = useState<any[]>([]);
  const [supportedSportIds, setSupportedSportIds] = useState<string[]>([]);
  const [originalData, setOriginalData] = useState<{
    orgName: string;
    shortName: string;
    primaryColor: string;
    secondaryColor: string;
    logo: string;
    description: string;
    logoConfig: { scale: number; x: number; y: number };
    supportedSportIds: string[];
  } | null>(null);
  
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

    wsService.emit('get_data', { type: 'sports' }, (sportsList: any) => {
      if (Array.isArray(sportsList)) {
        setAllSports(sportsList);
      }
    });

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
        const lConfig = orgSettings.logoConfig || { scale: 1, x: 0, y: 0 };
        setLogoConfig(lConfig);

        const sIds = res.supportedSportIds || [];
        setSupportedSportIds(sIds);

        setOriginalData({
          orgName: res.name || '',
          shortName: res.shortName || '',
          primaryColor: res.primaryColor || '#FF3E00',
          secondaryColor: res.secondaryColor || '#00E5FF',
          logo: res.logo || '',
          description: res.description || '',
          logoConfig: lConfig,
          supportedSportIds: sIds,
        });
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
          const lConfig = orgSettings.logoConfig || { scale: 1, x: 0, y: 0 };
          setLogoConfig(lConfig);

          const sIds = event.data.supportedSportIds || [];
          setSupportedSportIds(sIds);

          setOriginalData({
            orgName: event.data.name || '',
            shortName: event.data.shortName || '',
            primaryColor: event.data.primaryColor || '#FF3E00',
            secondaryColor: event.data.secondaryColor || '#00E5FF',
            logo: event.data.logo || '',
            description: event.data.description || '',
            logoConfig: lConfig,
            supportedSportIds: sIds,
          });
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

  const handleApplyLogoConfig = (newUri: string, newConfig: { scale: number; x: number; y: number }) => {
    console.log('[OrgSettings] handleApplyLogoConfig called. newUri starts with:', newUri ? newUri.substring(0, 50) : 'null/empty');
    setLogo(newUri);
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

  const hasChanges = originalData ? (
    orgName.trim() !== originalData.orgName ||
    shortName.trim() !== originalData.shortName ||
    primaryColor.trim() !== originalData.primaryColor ||
    secondaryColor.trim() !== originalData.secondaryColor ||
    logo.trim() !== originalData.logo ||
    description.trim() !== originalData.description ||
    logoConfig.scale !== originalData.logoConfig.scale ||
    logoConfig.x !== originalData.logoConfig.x ||
    logoConfig.y !== originalData.logoConfig.y ||
    JSON.stringify([...supportedSportIds].sort()) !== JSON.stringify([...originalData.supportedSportIds].sort())
  ) : false;

  const handleCancel = () => {
    if (!originalData) return;
    setOrgName(originalData.orgName);
    setShortName(originalData.shortName);
    setPrimaryColor(originalData.primaryColor);
    setSecondaryColor(originalData.secondaryColor);
    setLogo(originalData.logo);
    setDescription(originalData.description);
    setLogoConfig(originalData.logoConfig);
    setSupportedSportIds(originalData.supportedSportIds);
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
        supportedSportIds: supportedSportIds,
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
        setOriginalData({
          orgName: orgName.trim(),
          shortName: shortName.trim(),
          primaryColor: primaryColor.trim(),
          secondaryColor: secondaryColor.trim(),
          logo: logo.trim(),
          description: description.trim(),
          logoConfig: logoConfig,
          supportedSportIds: supportedSportIds,
        });
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
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
        {/* HEADER BAR */}
        <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
          <TouchableOpacity
            onPress={() => router.back()}
            className="flex-row items-center gap-1 active:opacity-85"
          >
            <Ionicons name="chevron-back" size={20} color="#FF3E00" />
            <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Back
            </Text>
          </TouchableOpacity>
          <Text className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white uppercase">
            Org Settings
          </Text>
          <View className="w-10 h-2" />
        </View>

        <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: hasChanges ? 140 : 60 }}>


        {saveSuccess && (
          <GlassCard className="bg-emerald-500/10 border border-emerald-500/20 p-4 mb-6 flex-row items-center gap-3 rounded-xl">
            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            <Text className="font-inter-bold text-xs text-emerald-600 dark:text-emerald-400">
              Settings saved successfully!
            </Text>
          </GlassCard>
        )}

        {/* Social Profile Header Banner */}
        <OrgBrandedCard
          primaryColor={primaryColor}
          secondaryColor={secondaryColor}
          className="h-36 w-full justify-center pl-2 pr-6 mb-6"
        >
          {/* Squircle Logo Crest centered vertically on the left (Floating Style) */}
          <TouchableOpacity 
            onPress={handleOpenLogoEditor}
            className="w-32 h-32 rounded-3xl items-center justify-center overflow-hidden shadow-2xl relative border bg-white/15 border-white/20 dark:bg-slate-950/20 dark:border-white/10"
            activeOpacity={0.9}
          >
            {logo ? (
              <OrgLogo logo={logo} settings={{ ...settings, logoConfig }} size={128} />
            ) : (
              <View className="w-full h-full items-center justify-center bg-slate-100/10 dark:bg-slate-800/10">
                <Ionicons name="business" size={56} color={getContrastColor(primaryColor)} />
              </View>
            )}
            
            {/* Floating edit badge */}
            <View className="absolute bottom-1.5 right-1.5 bg-brand-orange w-6 h-6 rounded-full items-center justify-center border border-white dark:border-slate-900 shadow-md">
              <Ionicons name="pencil-sharp" size={10} color="white" />
            </View>
          </TouchableOpacity>
        </OrgBrandedCard>
 
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
              className="font-orbitron-bold text-lg text-slate-800 dark:text-white bg-slate-100/30 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5"
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
                className="font-orbitron-bold text-lg text-slate-800 dark:text-white bg-slate-100/30 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 w-36 text-center"
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
                  className="flex-1 flex-row items-center gap-2 border border-transparent rounded-xl p-2 bg-slate-100/20 dark:bg-white/5"
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
                  className="flex-1 flex-row items-center gap-2 border border-transparent rounded-xl p-2 bg-slate-100/20 dark:bg-white/5"
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
              className="font-inter text-sm text-slate-800 dark:text-white bg-slate-100/30 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 min-h-[80px]"
            />
          </View>
        </View>

        {/* Supported Sports Section */}
        <View className="mb-6 mt-6">
          <Text className="font-orbitron-bold text-xs text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
            Supported Sports
          </Text>
          <GlassCard className="border border-slate-200 dark:border-white/5 p-5">
            <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mb-4">
              Toggle the sports supported by this organization. Enabling a sport allows creating teams and scheduling fixtures for it.
            </Text>
            
            <View className="flex-row flex-wrap gap-2.5">
              {allSports.map((sport) => {
                const isEnabled = supportedSportIds.includes(sport.id);
                return (
                  <TouchableOpacity
                    key={sport.id}
                    onPress={() => {
                      if (isEnabled) {
                        setSupportedSportIds(prev => prev.filter(id => id !== sport.id));
                      } else {
                        setSupportedSportIds(prev => [...prev, sport.id]);
                      }
                    }}
                    style={{
                      borderColor: isEnabled ? secondaryColor : getThemeColor(isDark, 'border'),
                      backgroundColor: isEnabled ? primaryColor : 'transparent',
                    }}
                    className="flex-row items-center gap-2 border px-3.5 py-2 rounded-xl active:scale-95"
                  >
                    <Ionicons 
                      name={isEnabled ? "checkmark-circle" : "add-circle-outline"} 
                      size={16} 
                      color={isEnabled ? secondaryColor : getThemeColor(isDark, 'textSecondary')} 
                    />
                    <Text 
                      style={{ color: isEnabled ? getContrastColor(primaryColor) : getThemeColor(isDark, 'textSecondary') }}
                      className="font-inter-bold text-xs"
                    >
                      {sport.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </GlassCard>
        </View>
      </ScrollView>

      {/* OVERLAY MODAL: EDIT PRIMARY COLOR */}
      {isEditingPrimary && (
        <View className="absolute inset-0 bg-slate-950/75 items-center justify-center z-50 p-6">
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
                className="flex-1 py-3 bg-slate-100 dark:bg-white/10 rounded-xl items-center justify-center border border-slate-200 dark:border-white/5"
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
        <View className="absolute inset-0 bg-slate-950/75 items-center justify-center z-50 p-6">
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
                className="flex-1 py-3 bg-slate-100 dark:bg-white/10 rounded-xl items-center justify-center border border-slate-200 dark:border-white/5"
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

      {/* LOGO EDITOR — shared ImageEditor component */}
      <ImageEditor
        visible={isEditingLogo}
        imageUri={logo.startsWith('data:') || logo.startsWith('http') ? logo : (logo ? getOrgLogoUrl(logo, 'large') : '')}
        config={logoConfig}
        title="Adjust Logo Placement"
        allowRemove
        onApply={handleApplyLogoConfig}
        onCancel={() => setIsEditingLogo(false)}
      />

      {/* FLOATING SAVE CHANGES BAR */}
      {hasChanges && (
        <View className="absolute bottom-6 left-6 right-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 p-4 rounded-2xl flex-row items-center justify-between shadow-xl z-40">
          <View className="flex-1 mr-4">
            <Text className="font-orbitron-bold text-[10px] text-slate-800 dark:text-white uppercase tracking-wider">Unsaved Changes</Text>
            <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">You have modified this organization's settings.</Text>
          </View>
          <View className="flex-row items-center gap-2.5">
            <TouchableOpacity
              onPress={handleCancel}
              disabled={isSaving}
              className="bg-slate-100 dark:bg-slate-800 px-4 py-2.5 rounded-xl active:scale-95 border border-slate-200 dark:border-white/5"
            >
              <Text className="font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-300 uppercase tracking-widest">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              disabled={isSaving}
              className="bg-brand-orange px-5 py-2.5 rounded-xl flex-row items-center gap-2 active:scale-95 shadow-md shadow-brand-orange/30"
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={14} color="white" />
                  <Text className="font-orbitron-bold text-[9px] text-white uppercase tracking-widest mt-0.5">Save</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
