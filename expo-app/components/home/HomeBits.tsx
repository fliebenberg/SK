import React from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';

/** Small pieces Home's cards share (`HOME-1`). */

/** A card's "Show more" / "Show less", under its list. */
export function ShowMore({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <TouchableOpacity onPress={onToggle} accessibilityRole="button" hitSlop={8} className="pt-1">
      <Text className="font-inter-bold text-sm text-primary-ink">{open ? 'Show less' : 'Show more'}</Text>
    </TouchableOpacity>
  );
}

/**
 * A read that failed, in the card it belongs to (`SYNC-9`). With nothing to show it takes the card's
 * place; with `stale`, it sits above the list last read and says that is what it is.
 */
export function ReadFailure({ what, reason, onRetry, stale = false }: {
  /** What did not load, as the start of a sentence: "Organisations". */
  what: string;
  reason: string;
  onRetry: () => void;
  stale?: boolean;
}) {
  return (
    <View className={`gap-2 items-start rounded-xl bg-warning-soft px-3 py-2.5 ${stale ? 'mb-2' : ''}`}>
      <Text className="font-inter text-[13px] text-warning-ink leading-5">
        <Text className="font-inter-bold">{what} {stale ? 'did not update.' : 'did not load.'}</Text> {reason}
      </Text>
      <TouchableOpacity onPress={onRetry} accessibilityRole="button" className="px-4 py-2 rounded-xl bg-primary">
        <Text className="font-inter-bold text-xs text-on-primary">Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

/** A group's heading inside a card — "ON NOW", "LATER TODAY" — as the organisation page draws them. */
export function GroupHeading({ label, first, tone = 'muted' }: { label: string; first: boolean; tone?: 'muted' | 'live' }) {
  return (
    <Text className={`font-orbitron-bold text-[9px] uppercase tracking-widest pb-1 ${tone === 'live' ? 'text-danger-ink' : 'text-ink-muted'} ${first ? '' : 'pt-3'}`}>
      {label}
    </Text>
  );
}

/** One line of a list inside a card: what it is, a line about it, something at the end, and where it goes. */
export function HomeRow({ lead, title, tags, subtitle, end, first, onPress, label }: {
  lead?: React.ReactNode;
  title: string;
  tags?: React.ReactNode;
  subtitle?: string;
  end?: React.ReactNode;
  first: boolean;
  onPress?: () => void;
  label?: string;
}) {
  const isDark = useActiveTheme() === 'dark';
  const body = (
    <View className={`flex-row items-center gap-3 py-2.5 ${first ? '' : 'border-t border-line-soft'}`}>
      {lead}
      <View className="flex-1 min-w-0">
        <View className="flex-row items-center gap-1.5 min-w-0">
          <Text className="flex-shrink font-inter-semibold text-[15px] text-ink" numberOfLines={1}>{title}</Text>
          {tags}
        </View>
        {subtitle ? <Text className="font-inter text-xs text-ink-muted mt-0.5" numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {end ? <View className="items-end gap-0.5">{end}</View> : null}
      {onPress ? <Ionicons name="chevron-forward" size={14} color={themeColor(isDark, 'ink-faint')} /> : null}
    </View>
  );
  return onPress
    ? <TouchableOpacity onPress={onPress} accessibilityRole="link" accessibilityLabel={label || title}>{body}</TouchableOpacity>
    : body;
}

/** A round icon plate, for a row with no logo — a team, a site. */
export function IconMark({ name, size = 36 }: { name: React.ComponentProps<typeof Ionicons>['name']; size?: number }) {
  const isDark = useActiveTheme() === 'dark';
  return (
    <View className="rounded-xl bg-sunken items-center justify-center" style={{ width: size, height: size }}>
      <Ionicons name={name} size={Math.round(size * 0.45)} color={themeColor(isDark, 'ink-muted')} />
    </View>
  );
}

/** The one search on Home: organisations, teams and sites. */
export function HomeSearchBox({ value, onChange, className = '' }: { value: string; onChange: (text: string) => void; className?: string }) {
  const isDark = useActiveTheme() === 'dark';
  const active = value.trim().length > 0;
  return (
    <View className={`flex-row items-center gap-2.5 rounded-2xl border px-4 py-3 ${active ? 'bg-primary-soft border-primary-line' : 'bg-card border-line'} ${className}`}>
      <Ionicons name="search" size={18} color={themeColor(isDark, active ? 'primary-ink' : 'ink-muted')} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Search organisations, teams and sites"
        placeholderTextColor={themeColor(isDark, 'ink-muted')}
        autoCorrect={false}
        returnKeyType="search"
        className="flex-1 font-inter text-[15px] text-ink outline-none"
        accessibilityLabel="Search organisations, teams and sites"
      />
      {active ? (
        <TouchableOpacity onPress={() => onChange('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear the search">
          <Ionicons name="close" size={18} color={themeColor(isDark, 'primary-ink')} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
