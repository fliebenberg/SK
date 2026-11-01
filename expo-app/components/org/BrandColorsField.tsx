import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { isHexColor } from '@sk/shared';
import { FieldLabel } from '../FieldLabel';
import { ColorPicker } from '../ColorPicker';

type ColorKey = 'primary' | 'secondary' | 'tertiary';
const NAMES: Record<ColorKey, string> = { primary: 'Primary', secondary: 'Secondary', tertiary: 'Third' };

/**
 * An organisation's brand colours: a swatch for each, and the colour picker opening under the one
 * being changed. The one way to enter them (design_system.md, *Read-first record pages* rule 9)
 * — used by the identity dialog and by both ways of creating an org, so someone registering a
 * school can give it its colours there and then.
 *
 * The primary is required. The other two are optional: empty means "not set", shown as "Same as"
 * the colour before it and painted as that colour (`orgColors`). A new org starts with the app's
 * two colours filled in, so leaving the field alone still gives it two, and no third.
 */
export function BrandColorsField({ primary, secondary, tertiary, onChange, label = 'Brand colours' }: {
  primary: string;
  /** `''` for not set. */
  secondary: string;
  /** `''` for not set. */
  tertiary: string;
  onChange: (next: { primary: string; secondary: string; tertiary: string }) => void;
  label?: string;
}) {
  const [open, setOpen] = useState<ColorKey | null>(null);
  const colors = { primary, secondary, tertiary };
  const set = (key: ColorKey, hex: string) => onChange({ ...colors, [key]: hex });
  /** What a colour falls back to when not set, and what it is painted as then. */
  const before = (key: ColorKey): ColorKey => (key === 'tertiary' ? 'secondary' : 'primary');
  const painted = (key: ColorKey): string => colors[key] || (key === 'primary' ? primary : painted(before(key)));

  const swatch = (key: ColorKey) => {
    const unset = key !== 'primary' && !colors[key];
    const shown = painted(key);
    return (
      <TouchableOpacity
        key={key}
        onPress={() => setOpen(open === key ? null : key)}
        accessibilityRole="button"
        accessibilityLabel={`Change the ${NAMES[key].toLowerCase()} colour`}
        style={{ flexGrow: 1, flexBasis: 130 }}
        className={`flex-row items-center gap-2.5 rounded-xl border px-3 py-2.5 bg-field ${
          open === key ? 'border-primary' : 'border-line'
        }`}
      >
        {/* colour-data: an org colour's swatch, white until one is set */}
        <View className="w-6 h-6 rounded-md border border-line-strong" style={{ backgroundColor: isHexColor(shown) ? shown : '#FFFFFF' }} />
        <View className="flex-1 min-w-0">
          <Text className="font-inter-semibold text-sm text-ink">
            {NAMES[key]}
            {key !== 'primary' ? <Text className="font-inter text-[10px] text-ink-muted">  Optional</Text> : null}
          </Text>
          <Text className="font-mono text-xs text-ink-muted">{unset ? `Same as ${before(key) === 'primary' ? 'primary' : 'secondary'}` : colors[key].toUpperCase()}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View className="gap-1.5">
      <FieldLabel label={label} />
      <View className="flex-row flex-wrap gap-3">
        {swatch('primary')}
        {swatch('secondary')}
        {swatch('tertiary')}
      </View>
      {open ? (
        <View className="gap-2">
          <ColorPicker
            key={open}
            value={painted(open)}
            onChange={hex => set(open, hex)}
          />
          {/* A way out of the panel that can be seen: before Done, only pressing the tile again closed it. */}
          <View className="flex-row items-center justify-between gap-4">
            {open !== 'primary' && colors[open] ? (
              <TouchableOpacity onPress={() => set(open, '')} hitSlop={8} accessibilityRole="button">
                <Text className="font-inter-bold text-sm text-primary-ink">Use the {before(open)} colour instead</Text>
              </TouchableOpacity>
            ) : <View />}
            <TouchableOpacity onPress={() => setOpen(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Done choosing the ${NAMES[open].toLowerCase()} colour`}>
              <Text className="font-inter-bold text-sm text-primary-ink">Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Why the colours cannot be saved, or `null` when they can. */
export function brandColorsProblem(primary: string, secondary: string, tertiary: string): string | null {
  if (!isHexColor(primary)) return 'The primary colour must be a six-digit hex code, like #FF3E00.';
  if (secondary && !isHexColor(secondary)) return 'The secondary colour must be a six-digit hex code, or left unset.';
  if (tertiary && !isHexColor(tertiary)) return 'The third colour must be a six-digit hex code, or left unset.';
  return null;
}
