import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CustomSelect from '../../CustomSelect';
import { SegmentedControl } from '../../SegmentedControl';

/**
 * The controls the sport editor is built from.
 *
 * They exist so the three tabs and the event template editor stay legible: the styling for a
 * labelled input is a forty-character class string, and repeating it inline once per field made
 * the screen unreadable long before it was finished. Nothing here holds state or knows about
 * sports — each is a presentational wrapper over a react-native primitive.
 */

const INPUT_CLASS =
  'bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-white/5 p-3 rounded-xl font-inter text-sm text-slate-800 dark:text-white';

const SMALL_INPUT_CLASS =
  'bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-white/5 px-3 py-2.5 rounded-xl font-inter text-sm text-slate-800 dark:text-white';

export const slugify = (text: string): string =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/(^_|_$)/g, '');

interface FieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

/** A labelled row: the label, the control, and an optional line of explanation under it. */
export function Field({ label, hint, children, className = '' }: FieldProps) {
  return (
    <View className={className}>
      <Text className="font-inter-bold text-xs text-slate-700 dark:text-slate-300 mb-1.5">{label}</Text>
      {children}
      {!!hint && (
        <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">{hint}</Text>
      )}
    </View>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  hint?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?: boolean;
  className?: string;
  small?: boolean;
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  autoCapitalize,
  multiline,
  className = '',
  small,
}: TextFieldProps) {
  return (
    <Field label={label} hint={hint} className={className}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        className={`${small ? SMALL_INPUT_CLASS : INPUT_CLASS} ${multiline ? 'min-h-[88px]' : ''}`}
        style={multiline ? { textAlignVertical: 'top' } : undefined}
      />
    </Field>
  );
}

interface NumberFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  hint?: string;
  /** Whole numbers only — decimals are stripped as they are typed. */
  integer?: boolean;
  className?: string;
  small?: boolean;
}

export function NumberField({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  integer,
  className = '',
  small,
}: NumberFieldProps) {
  const pattern = integer ? /[^0-9-]/g : /[^0-9.-]/g;
  return (
    <Field label={label} hint={hint} className={className}>
      <TextInput
        value={value}
        onChangeText={(text) => onChangeText(text.replace(pattern, ''))}
        placeholder={placeholder}
        keyboardType="numeric"
        className={small ? SMALL_INPUT_CLASS : INPUT_CLASS}
      />
    </Field>
  );
}

/**
 * A read-only identifier.
 *
 * Ids are locked once saved because stored game events reference them: an event recorded as
 * `early_push` resolves its display name by looking the id up in the template, so renaming one
 * leaves the event feed printing a raw id. Renaming the *name* beside it is always safe.
 */
export function LockedIdField({ label, value, hint, className = '' }: { label: string; value: string; hint?: string; className?: string }) {
  return (
    <Field
      label={label}
      hint={hint ?? 'Fixed once saved — existing events reference it. Edit the name instead.'}
      className={className}
    >
      <View className="flex-row items-center gap-2 bg-slate-200/60 dark:bg-slate-900/80 border border-slate-200 dark:border-white/5 p-3 rounded-xl">
        <Ionicons name="lock-closed" size={12} color="#94A3B8" />
        <Text className="font-orbitron-bold text-xs text-slate-500 dark:text-slate-400 flex-1" numberOfLines={1}>
          {value || '—'}
        </Text>
      </View>
    </Field>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  hint?: string;
  className?: string;
}

export function SelectField({ label, value, onChange, options, placeholder, hint, className = '' }: SelectFieldProps) {
  return (
    <Field label={label} hint={hint} className={className}>
      <CustomSelect value={value} onChange={onChange} options={options} placeholder={placeholder} />
    </Field>
  );
}

interface ToggleFieldProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
  trueLabel?: string;
  falseLabel?: string;
  className?: string;
}

export function ToggleField({
  label,
  value,
  onChange,
  hint,
  trueLabel = 'Yes',
  falseLabel = 'No',
  className = '',
}: ToggleFieldProps) {
  return (
    <Field label={label} hint={hint} className={className}>
      <SegmentedControl
        isCompact={false}
        value={value ? 'YES' : 'NO'}
        onChange={(key) => onChange(key === 'YES')}
        options={[
          { key: 'NO', label: falseLabel },
          { key: 'YES', label: trueLabel },
        ]}
      />
    </Field>
  );
}

/** The uppercase micro-heading the admin screens use above a card. */
export function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <Text
      className={`font-orbitron-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest ${className}`}
    >
      {children}
    </Text>
  );
}

/** A small pill button, used for "Add" actions above a list. */
export function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-row items-center gap-1 bg-slate-200 dark:bg-slate-850 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-white/5 active:opacity-80"
    >
      <Ionicons name="add" size={12} color="#FF3E00" />
      <Text className="font-orbitron-bold text-[8px] text-slate-700 dark:text-slate-300 uppercase tracking-wider mt-0.5">
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/** Reorder and delete controls for one row of an ordered list. */
export function RowActions({
  onMoveUp,
  onMoveDown,
  onDelete,
  canMoveUp,
  canMoveDown,
}: {
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDelete: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}) {
  return (
    <View className="flex-row items-center gap-1.5">
      {!!onMoveUp && (
        <TouchableOpacity
          onPress={onMoveUp}
          disabled={!canMoveUp}
          className={`p-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-lg ${
            canMoveUp ? 'active:opacity-80' : 'opacity-30'
          }`}
        >
          <Ionicons name="arrow-up" size={12} color="#94A3B8" />
        </TouchableOpacity>
      )}
      {!!onMoveDown && (
        <TouchableOpacity
          onPress={onMoveDown}
          disabled={!canMoveDown}
          className={`p-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-lg ${
            canMoveDown ? 'active:opacity-80' : 'opacity-30'
          }`}
        >
          <Ionicons name="arrow-down" size={12} color="#94A3B8" />
        </TouchableOpacity>
      )}
      <TouchableOpacity
        onPress={onDelete}
        className="p-2 bg-red-500/10 dark:bg-red-500/5 border border-red-500/20 rounded-lg active:opacity-80"
      >
        <Ionicons name="trash" size={12} color="#EF4444" />
      </TouchableOpacity>
    </View>
  );
}

/** A collapsible block — the editor uses one per outcome, reason group and advanced section. */
export function Collapsible({
  title,
  subtitle,
  badge,
  defaultOpen = false,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  defaultOpen?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <View className="border border-slate-200 dark:border-white/5 rounded-xl bg-slate-50/60 dark:bg-slate-900/40 overflow-hidden">
      <View className="flex-row items-center gap-2 px-3 py-2.5">
        <TouchableOpacity onPress={() => setIsOpen((open) => !open)} className="flex-row items-center gap-2 flex-1 active:opacity-80">
          <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={14} color="#94A3B8" />
          <View className="flex-1">
            <Text className="font-inter-bold text-xs text-slate-800 dark:text-white" numberOfLines={1}>
              {title}
            </Text>
            {!!subtitle && (
              <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 mt-0.5" numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>
          {!!badge && (
            <View className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded">
              <Text className="font-inter-bold text-[9px] text-slate-600 dark:text-slate-300">{badge}</Text>
            </View>
          )}
        </TouchableOpacity>
        {actions}
      </View>
      {isOpen && <View className="px-3 pb-3 space-y-3">{children}</View>}
    </View>
  );
}

/** An empty-state block for a list with nothing in it yet. */
export function EmptyHint({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View className="items-center py-6">
      <Ionicons name={icon} size={22} color="#94A3B8" />
      <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 italic mt-2 text-center px-4">{text}</Text>
    </View>
  );
}

/**
 * Add/remove rows for a free-form `eventData`-style map.
 *
 * Values are typed, because the difference matters downstream: `successful: true` is read as a
 * boolean by the stats screens, and storing the string `"true"` there would quietly fail every
 * truthiness check that compares against `false`.
 */
export function KeyValueEditor({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: Record<string, any> | undefined;
  onChange: (next: Record<string, any> | undefined) => void;
}) {
  const entries = useMemo(() => Object.entries(value || {}), [value]);

  const writeEntries = (next: Array<[string, any]>) => {
    const filled = next.filter(([key]) => key.trim() !== '');
    onChange(filled.length === 0 ? undefined : Object.fromEntries(filled));
  };

  const setKey = (index: number, key: string) => {
    const next = entries.map((entry, idx) => (idx === index ? ([key, entry[1]] as [string, any]) : entry));
    writeEntries(next);
  };

  const setValue = (index: number, raw: string) => {
    // `true` / `false` / a number are stored as themselves; everything else stays a string.
    let parsed: any = raw;
    if (raw === 'true') parsed = true;
    else if (raw === 'false') parsed = false;
    else if (raw.trim() !== '' && Number.isFinite(Number(raw))) parsed = Number(raw);
    const next = entries.map((entry, idx) => (idx === index ? ([entry[0], parsed] as [string, any]) : entry));
    writeEntries(next);
  };

  return (
    <View>
      <View className="flex-row items-center justify-between mb-1.5">
        <Text className="font-inter-bold text-xs text-slate-700 dark:text-slate-300">{label}</Text>
        <AddButton label="Add Field" onPress={() => writeEntries([...entries, ['', '']])} />
      </View>
      {entries.length === 0 ? (
        <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 italic">None</Text>
      ) : (
        <View className="space-y-2">
          {entries.map(([key, entryValue], index) => (
            <View key={index} className="flex-row items-center gap-2">
              <TextInput
                value={key}
                onChangeText={(text) => setKey(index, text)}
                placeholder="key"
                autoCapitalize="none"
                className={`${SMALL_INPUT_CLASS} flex-1`}
              />
              <TextInput
                value={entryValue === undefined || entryValue === null ? '' : String(entryValue)}
                onChangeText={(text) => setValue(index, text)}
                placeholder="value"
                autoCapitalize="none"
                className={`${SMALL_INPUT_CLASS} flex-1`}
              />
              <RowActions onDelete={() => writeEntries(entries.filter((_, idx) => idx !== index))} />
            </View>
          ))}
        </View>
      )}
      {!!hint && <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">{hint}</Text>}
    </View>
  );
}

/**
 * A JSON text box for the corners of the spec that have no fixed shape — `outcomeOverrides` and a
 * `FORM_INPUT` step's `fields`. It holds the text the user typed even while that text is invalid,
 * and reports validity so the editor can refuse to save a broken document.
 */
export function JsonField({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: any;
  onChange: (parsed: any, isValid: boolean) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(() => (value === undefined ? '' : JSON.stringify(value, null, 2)));
  const [error, setError] = useState<string | null>(null);

  const handleChange = (next: string) => {
    setText(next);
    if (next.trim() === '') {
      setError(null);
      onChange(undefined, true);
      return;
    }
    try {
      const parsed = JSON.parse(next);
      setError(null);
      onChange(parsed, true);
    } catch (err: any) {
      setError(err.message || 'Invalid JSON');
      onChange(undefined, false);
    }
  };

  return (
    <Field label={label} hint={hint}>
      <TextInput
        value={text}
        onChangeText={handleChange}
        placeholder={placeholder}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        className={`${INPUT_CLASS} min-h-[96px]`}
        style={{ textAlignVertical: 'top', fontFamily: 'monospace' }}
      />
      {!!error && (
        <Text className="font-inter text-[10px] text-red-500 dark:text-red-400 mt-1.5">{error}</Text>
      )}
    </Field>
  );
}
