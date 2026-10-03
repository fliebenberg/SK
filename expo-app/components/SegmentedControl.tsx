import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../store/settingsStore';
import { themeColor } from '../constants/Colors';


export interface SegmentedControlOption<T extends string = string> {
  key: T;
  label: string;
  /**
   * A count shown after the label ("Staff 2"). In a `fit` control it is the first thing to go when
   * space is short — the label never is — and on web it is then still there on hover.
   */
  count?: number;
  icon?: keyof typeof Ionicons.glyphMap;
  iconActive?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string = string> {
  options: Array<SegmentedControlOption<T>>;
  value: T;
  onChange: (key: T) => void;
  isCompact?: boolean;
  /**
   * Size to the labels instead of stretching to the width given — for a filter beside a search box
   * (docs/design_spec.md §5). Each segment is as wide as its own label, and when the row is too
   * narrow for the counts as well, the counts are dropped rather than any label being cut short.
   */
  fit?: boolean;
  className?: string;
}

const IS_WEB = Platform.OS === 'web';

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  isCompact: explicitIsCompact,
  fit = false,
  className = '',
}: SegmentedControlProps<T>) {
  const { width } = useWindowDimensions();
  const isDark = useActiveTheme() === 'dark';
  const isCompact = explicitIsCompact ?? width < 640;

  /* For `fit`: the control's natural width with and without counts, and the width it was given.
     The given width does not depend on which version is showing — the wrapper asks for the
     with-counts width and is only ever squeezed below it — so choosing cannot feed back into it. */
  const [withCounts, setWithCounts] = useState<number | null>(null);
  const [withoutCounts, setWithoutCounts] = useState<number | null>(null);
  const [room, setRoom] = useState<number | null>(null);
  const hasCounts = options.some(o => o.count !== undefined);
  const showCounts = !fit || withCounts === null || room === null || room + 1 >= withCounts;

  const track = (counts: boolean, segmentClass: string, interactive: boolean) => (
    <View className={`flex-row items-center bg-sunken p-1 rounded-xl border border-line-soft ${className}`}>
      {options.map((item) => {
        const isActive = item.key === value;
        const iconName = (isActive && item.iconActive) ? item.iconActive : item.icon;

        if (isCompact && item.icon) {
          return (
            <TouchableOpacity
              key={item.key}
              onPress={() => onChange(item.key)}
              disabled={isActive || item.disabled}
              activeOpacity={0.8}
              className={`w-8 h-8 rounded-lg items-center justify-center ${
                isActive
                  ? 'bg-raised border border-primary-line shadow-sm'
                  : 'bg-transparent border border-transparent shadow-none'
              } ${item.disabled ? 'opacity-40' : ''}`}
            >
              <Ionicons
                name={iconName}
                size={14}
                color={isActive ? themeColor(isDark, 'primary') : themeColor(isDark, 'ink-muted')}
              />
            </TouchableOpacity>
          );
        }

        const label = counts && item.count !== undefined ? `${item.label} ${item.count}` : item.label;
        const hiddenCount = !counts && item.count !== undefined ? `${item.label} ${item.count}` : undefined;
        return (
          // The inactive option carries `shadow-none` on purpose. NativeWind's shadow utilities are
          // backed by CSS variables, and a component that only starts declaring one after its first
          // render gets wrapped in a variable provider — which changes its element type and remounts
          // it. Declaring the variable in both states keeps selecting an option a re-render rather
          // than a remount.
          <TouchableOpacity
            key={item.key}
            onPress={() => onChange(item.key)}
            disabled={!interactive || isActive || item.disabled}
            activeOpacity={0.85}
            accessibilityLabel={item.count !== undefined ? `${item.label}, ${item.count}` : undefined}
            className={`${segmentClass} px-3 py-2 rounded-lg ${
              isActive
                ? 'bg-raised border border-primary-line shadow-sm'
                : 'bg-transparent border border-transparent shadow-none'
            } ${item.disabled ? 'opacity-40' : ''}`}
          >
            <HoverTitle title={hiddenCount} className="flex-row items-center justify-center gap-1.5">
              {iconName && (
                <Ionicons
                  name={iconName}
                  size={14}
                  color={isActive ? themeColor(isDark, 'primary') : themeColor(isDark, 'ink-muted')}
                />
              )}
              <Text
                numberOfLines={1}
                className={`font-inter-bold text-xs ${
                  isActive ? 'text-primary-ink' : 'text-ink-muted'
                }`}
              >
                {label}
              </Text>
            </HoverTitle>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  if (!fit) return track(true, 'flex-1', true);

  return (
    <View
      style={{ width: withCounts ?? undefined, minWidth: withoutCounts ?? undefined, flexShrink: 1 }}
      onLayout={e => setRoom(e.nativeEvent.layout.width)}
    >
      {/* Both versions drawn unseen, at their natural widths, to learn how much room each needs. */}
      <View pointerEvents="none" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }}>
        <View style={{ width: 10000, alignItems: 'flex-start' }} aria-hidden>
          <View onLayout={e => setWithCounts(e.nativeEvent.layout.width)}>{track(true, '', false)}</View>
          {hasCounts ? <View onLayout={e => setWithoutCounts(e.nativeEvent.layout.width)}>{track(false, '', false)}</View> : null}
        </View>
      </View>
      {/* Without counts the wrapper may be a little wider than the track needs; the segments share it. */}
      {track(showCounts, 'flex-grow', true)}
    </View>
  );
}

/**
 * A view with a browser tooltip — the count a `fit` control had to drop, on hover. Web only; a
 * touch screen has no hover, and screen readers get the count from the segment's label.
 */
function HoverTitle({ title, className, children }: { title?: string; className: string; children: React.ReactNode }) {
  const ref = useRef<View>(null);
  useEffect(() => {
    if (!IS_WEB) return;
    const node = ref.current as unknown as HTMLElement | null;
    if (!node?.setAttribute) return;
    if (title) node.setAttribute('title', title);
    else node.removeAttribute('title');
  }, [title]);
  return <View ref={ref} className={className}>{children}</View>;
}
