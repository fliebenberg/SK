import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { isHexColor } from '@sk/shared';
import { FieldLabel } from '../FieldLabel';
import { ColorPicker } from '../ColorPicker';

/**
 * An organisation's two brand colours: a swatch for each, and the colour picker opening under the
 * one being changed. The one way to enter them (design_system.md, *Read-first record pages* rule 9)
 * — used by the identity dialog and by both ways of creating an org, so someone registering a
 * school can give it its colours there and then.
 *
 * The primary is required. The secondary is optional: empty means "not set", shown as "Same as
 * primary" and painted as the primary (`orgColors`). A new org starts with the app's two colours
 * filled in, so leaving the field alone still gives it two.
 */
export function BrandColorsField({ primary, secondary, onChange, label = 'Brand colours' }: {
  primary: string;
  /** `''` for not set. */
  secondary: string;
  onChange: (next: { primary: string; secondary: string }) => void;
  label?: string;
}) {
  const [open, setOpen] = useState<'primary' | 'secondary' | null>(null);

  const swatch = (key: 'primary' | 'secondary') => {
    const isSecondary = key === 'secondary';
    const unset = isSecondary && !secondary;
    const value = isSecondary ? secondary : primary;
    // An unset secondary is shown as what it is painted as: the primary.
    const shown = unset ? primary : value;
    return (
      <TouchableOpacity
        key={key}
        onPress={() => setOpen(open === key ? null : key)}
        accessibilityRole="button"
        accessibilityLabel={`Change the ${key} colour`}
        className={`flex-1 flex-row items-center gap-2.5 rounded-xl border px-3 py-2.5 bg-field ${
          open === key ? 'border-primary' : 'border-line'
        }`}
      >
        {/* colour-data: an org colour's swatch, white until one is set */}
        <View className="w-6 h-6 rounded-md border border-line-strong" style={{ backgroundColor: isHexColor(shown) ? shown : '#FFFFFF' }} />
        <View className="flex-1 min-w-0">
          <Text className="font-inter-semibold text-sm text-ink">
            {isSecondary ? 'Secondary' : 'Primary'}
            {isSecondary ? <Text className="font-inter text-[10px] text-ink-muted">  Optional</Text> : null}
          </Text>
          <Text className="font-mono text-xs text-ink-muted">{unset ? 'Same as primary' : value.toUpperCase()}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View className="gap-1.5">
      <FieldLabel label={label} />
      <View className="flex-row gap-3">
        {swatch('primary')}
        {swatch('secondary')}
      </View>
      {open ? (
        <View className="gap-2">
          <ColorPicker
            key={open}
            value={(open === 'primary' ? primary : secondary) || primary}
            onChange={hex => onChange(open === 'primary' ? { primary: hex, secondary } : { primary, secondary: hex })}
          />
          {open === 'secondary' && secondary ? (
            <TouchableOpacity onPress={() => onChange({ primary, secondary: '' })} hitSlop={8} accessibilityRole="button">
              <Text className="font-inter-bold text-sm text-primary-ink">Use the primary colour instead</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Why the colours cannot be saved, or `null` when they can. */
export function brandColorsProblem(primary: string, secondary: string): string | null {
  if (!isHexColor(primary)) return 'The primary colour must be a six-digit hex code, like #FF3E00.';
  if (secondary && !isHexColor(secondary)) return 'The secondary colour must be a six-digit hex code, or left unset.';
  return null;
}
