import React, { useRef, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, ScrollView, Text, TouchableOpacity, View } from 'react-native';

/**
 * Buttons that jump to each card of a long read-first page on a phone — Players, Staff, Games on
 * the team page; Facilities, Location, Coming up on the site page. Pinned under the header with the
 * page's search, and the card in view is highlighted (design_system.md, *Read-first record pages*).
 *
 * The buttons share the row equally. A count follows each label ("Staff 3") while every button has
 * room for it; when one would cut its label, the counts are dropped from all of them, so the row
 * never shows some with and some without. Screen readers always hear the count.
 *
 * `useJumpSections` keeps track of where each card is and which one is in view.
 */
export interface JumpSection<K extends string> {
  key: K;
  label: string;
  count?: number;
}

const GAP = 6;

export function JumpBar<K extends string>({ sections, inView, onJump }: {
  sections: JumpSection<K>[];
  inView: K;
  onJump: (key: K) => void;
}) {
  const [rowWidth, setRowWidth] = useState(0);
  const [widest, setWidest] = useState(0);
  const widths = useRef<Record<string, number>>({});
  const share = sections.length ? (rowWidth - GAP * (sections.length - 1)) / sections.length : 0;
  const showCounts = !rowWidth || !widest || widest <= share;

  const measure = (key: string, width: number) => {
    widths.current[key] = width;
    const max = Math.max(...sections.map(s => widths.current[s.key] || 0));
    if (max !== widest) setWidest(max);
  };

  return (
    <View onLayout={e => setRowWidth(e.nativeEvent.layout.width)}>
      {/* Each button drawn unseen at its natural width with its count, to learn whether it fits. */}
      <View pointerEvents="none" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }} aria-hidden>
        <View style={{ width: 10000, flexDirection: 'row', alignItems: 'flex-start' }}>
          {sections.map(s => (
            <View key={s.key} onLayout={e => measure(s.key, e.nativeEvent.layout.width)}>
              <ButtonFace section={s} active={false} showCount />
            </View>
          ))}
        </View>
      </View>
      <View className="flex-row" style={{ gap: GAP }}>
        {sections.map(s => (
          <TouchableOpacity
            key={s.key}
            onPress={() => onJump(s.key)}
            accessibilityRole="button"
            accessibilityLabel={s.count !== undefined ? `${s.label}, ${s.count}` : s.label}
            accessibilityState={{ selected: inView === s.key }}
            className={`flex-1 rounded-lg ${inView === s.key ? 'bg-raised border border-line-selected' : 'bg-sunken border border-transparent'}`}
          >
            <ButtonFace section={s} active={inView === s.key} showCount={showCounts} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function ButtonFace<K extends string>({ section, active, showCount }: { section: JumpSection<K>; active: boolean; showCount: boolean }) {
  return (
    <View className="flex-row items-center justify-center gap-1 py-1.5 px-2">
      <Text numberOfLines={1} className={`font-inter-semibold text-[13px] ${active ? 'text-ink' : 'text-ink-soft'}`}>
        {section.label}
      </Text>
      {showCount && section.count !== undefined ? (
        <Text className={`font-inter text-xs ${active ? 'text-ink-soft' : 'text-ink-muted'}`}>{section.count}</Text>
      ) : null}
    </View>
  );
}

/**
 * Where each card of a phone page starts, which is in view, and a jump that scrolls to one.
 *
 * Wrap the column of cards in a view with `onColumnLayout` and each card in a view with
 * `track(key)`; give the page's `ScrollView` `scrollRef` and `onScroll`. A card is measured inside
 * the column and the column inside the page, so a jump adds the two. `padding` is the scroll
 * content's top padding.
 */
export function useJumpSections<K extends string>(order: K[], padding: number) {
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Partial<Record<K, number>>>({});
  const columnY = useRef(0);
  const [inView, setInView] = useState<K>(order[0]);

  const track = (key: K) => (e: { nativeEvent: { layout: { y: number } } }) => {
    sectionY.current[key] = e.nativeEvent.layout.y;
  };
  const onColumnLayout = (e: { nativeEvent: { layout: { y: number } } }) => {
    columnY.current = padding + e.nativeEvent.layout.y;
  };
  const jumpTo = (key: K) => {
    setInView(key);
    scrollRef.current?.scrollTo({ y: Math.max(0, columnY.current + (sectionY.current[key] || 0) - 8), animated: true });
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const y = contentOffset.y + 24 - columnY.current;
    // At the bottom the last card cannot reach the top of the screen, so it counts as in view.
    const atBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 8;
    const current = atBottom
      ? order[order.length - 1]
      : order.reduce<K>((at, k) => (y >= (sectionY.current[k] ?? Infinity) ? k : at), order[0]);
    if (current !== inView) setInView(current);
  };

  return { scrollRef, track, onColumnLayout, jumpTo, onScroll, inView };
}
