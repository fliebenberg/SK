import React, { useRef, useState } from 'react';
import { Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../store/settingsStore';
import { getThemeColor } from '../constants/Colors';
import { isHexColor } from '@sk/shared';

/**
 * Pick a colour: a base hue, then a shade, or a hex code typed in. On web the swatch also opens the
 * browser's own spectrum picker, and the eyedropper where the browser has one.
 *
 * Moved out of the org settings screen (2026-10-01), where it was written out twice — once for the
 * primary colour and once for the secondary — as full-screen overlays. It is now an inline panel so
 * the identity dialog can open it under the swatch being changed, with no second modal on top.
 */

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
  let clean = hex.replace('#', '');
  if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
  if (clean.length === 6) {
    r = parseInt(clean.substring(0, 2), 16) / 255;
    g = parseInt(clean.substring(2, 4), 16) / 255;
    b = parseInt(clean.substring(4, 6), 16) / 255;
  }
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
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

const BASE_HUES = [
  { name: 'Red', h: 0, s: 95, l: 50 },
  { name: 'Orange', h: 24, s: 95, l: 50 },
  { name: 'Yellow', h: 45, s: 95, l: 50 },
  { name: 'Green', h: 120, s: 75, l: 45 },
  { name: 'Teal', h: 170, s: 85, l: 40 },
  { name: 'Blue', h: 210, s: 90, l: 50 },
  { name: 'Purple', h: 270, s: 80, l: 55 },
  { name: 'Pink', h: 330, s: 85, l: 50 },
  { name: 'Grey', h: 0, s: 0, l: 50, isGrey: true },
];

const shadesOf = (hue: number, isGrey?: boolean) => isGrey
  ? ['#F8FAFC', '#F1F5F9', '#CBD5E1', '#94A3B8', '#64748B', '#475569', '#1E293B', '#0F172A']
  : [hslToHex(hue, 95, 90), hslToHex(hue, 95, 75), hslToHex(hue, 95, 62), hslToHex(hue, 95, 50),
     hslToHex(hue, 95, 42), hslToHex(hue, 95, 32), hslToHex(hue, 95, 22), hslToHex(hue, 45, 50)];

export { isHexColor };

export function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const isDark = useActiveTheme() === 'dark';
  const start = hexToHsl(isHexColor(value) ? value : '#FF3E00');
  const [hue, setHue] = useState(start.h);
  const [isGrey, setIsGrey] = useState(start.s === 0);
  const [text, setText] = useState(value);
  const webInputRef = useRef<any>(null);
  const hasEyedropper = Platform.OS === 'web' && typeof window !== 'undefined' && 'EyeDropper' in window;

  const set = (hex: string) => {
    setText(hex);
    if (isHexColor(hex)) onChange(hex.toUpperCase());
  };

  const openEyedropper = async () => {
    try {
      const result = await new (window as any).EyeDropper().open();
      if (result?.sRGBHex) set(result.sRGBHex);
    } catch {
      // Closed without picking.
    }
  };

  return (
    <View className="gap-3 rounded-xl border border-slate-200 dark:border-white/10 p-3">
      {Platform.OS === 'web'
        ? React.createElement('input', {
            ref: webInputRef,
            type: 'color',
            value: isHexColor(value) ? value : '#FFFFFF',
            onChange: (e: any) => set(e.target.value),
            style: { position: 'absolute', width: 0, height: 0, opacity: 0, border: 'none', padding: 0 },
          })
        : null}

      <View className="flex-row items-center gap-2">
        <TouchableOpacity
          onPress={() => webInputRef.current?.click()}
          disabled={Platform.OS !== 'web'}
          accessibilityLabel={Platform.OS === 'web' ? 'Open the colour spectrum' : undefined}
          className="w-10 h-10 rounded-lg border border-slate-300 dark:border-white/20"
          style={{ backgroundColor: isHexColor(value) ? value : '#FFFFFF' }}
        />
        <TextInput
          value={text}
          onChangeText={t => {
            let next = t.trim();
            if (next && !next.startsWith('#')) next = `#${next}`;
            set(next.substring(0, 7));
          }}
          maxLength={7}
          autoCapitalize="characters"
          autoCorrect={false}
          spellCheck={false}
          accessibilityLabel="Hex colour code"
          className="flex-1 font-mono text-sm text-slate-800 dark:text-white bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5 outline-none"
        />
        {hasEyedropper ? (
          <TouchableOpacity onPress={openEyedropper} accessibilityLabel="Pick a colour from the screen" className="w-10 h-10 rounded-xl items-center justify-center border border-slate-200 dark:border-white/10">
            <Ionicons name="color-palette-outline" size={18} color={getThemeColor(isDark, 'textPrimary')} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View className="gap-1.5">
        <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">Base colour</Text>
        <View className="flex-row flex-wrap gap-2">
          {BASE_HUES.map(b => {
            const selected = hue === b.h && isGrey === !!b.isGrey;
            return (
              <TouchableOpacity
                key={b.name}
                accessibilityLabel={b.name}
                onPress={() => { setHue(b.h); setIsGrey(!!b.isGrey); set(hslToHex(b.h, b.s, b.l)); }}
                className={`w-7 h-7 rounded-full ${selected ? 'border-2 border-brand-orange' : 'border border-slate-200 dark:border-white/10'}`}
                style={{ backgroundColor: hslToHex(b.h, b.s, b.l) }}
              />
            );
          })}
        </View>
      </View>

      <View className="gap-1.5">
        <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">Shade</Text>
        <View className="flex-row flex-wrap gap-2">
          {shadesOf(hue, isGrey).map(shade => (
            <TouchableOpacity
              key={shade}
              accessibilityLabel={shade}
              onPress={() => set(shade)}
              className={`w-7 h-7 rounded-lg ${value.toUpperCase() === shade.toUpperCase() ? 'border-2 border-brand-orange' : 'border border-slate-200 dark:border-white/10'}`}
              style={{ backgroundColor: shade }}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
