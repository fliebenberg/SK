import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../store/settingsStore';
import { COLORS, getThemeColor } from '../constants/Colors';

export interface TabItem<T extends string = string> {
  key: T;
  label: string;
  /**
   * A second line under the label, for tabs that stand for something the user has chosen rather
   * than somewhere they can go — the scoring stepper shows the reason or player picked on each
   * step here. Truncated to one line, so keep it to a few words.
   */
  sublabel?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /**
   * Anything to draw before the label — an organisation's crest, where `icon` cannot reach.
   *
   * Takes the place of `icon` when both are given, since two marks before one label is noise.
   * Keep it small and square: it sits on the label's line and a tall node stretches the strip.
   */
  leading?: React.ReactNode;
  badge?: string | number;
  /**
   * "There is something here", without saying how much.
   *
   * A `badge` is a count, and a count next to a tab label is read as a count of *new or unread
   * things* — which is what made the tournament Setup tab's bare "2" unreadable (U49): it was
   * counting outstanding steps, downward, while the progress bar one row below it counted done
   * steps upward. A dot asserts nothing a number would have to be labelled to assert, and the
   * page behind it is free to say "3 of 5 steps done" in full.
   *
   * Ignored when `badge` is set — a tab showing both would be saying the same thing twice.
   */
  dot?: boolean;
  disabled?: boolean;
}

export interface TabsProps<T extends string = string> {
  items: Array<TabItem<T>>;
  activeKey: T;
  onChange: (key: T) => void;
  variant?: 'underline' | 'pill';
  scrollable?: boolean;
  className?: string;
}

export function Tabs<T extends string = string>({
  items,
  activeKey,
  onChange,
  variant = 'underline',
  scrollable = false,
  className = '',
}: TabsProps<T>) {
  const isDark = useActiveTheme() === 'dark';

  /**
   * Keep the active tab on screen.
   *
   * A scrollable strip is the answer to "fifteen divisions do not fit", but on its own it only
   * solves the layout: the strip does not move, so a tab selected from elsewhere — a deep link, a
   * sport chosen above, going back to a screen — can be active and invisible, which reads as
   * nothing being selected at all. Each tab reports where it is, and a change scrolls to it.
   *
   * Positions are captured per tab rather than estimated, because the tabs are not equal width:
   * `U14 Rugby` and `Open Netball (Boys)` differ by half a strip.
   */
  const scrollRef = React.useRef<ScrollView>(null);
  const layouts = React.useRef<Record<string, { x: number; width: number }>>({});
  const viewportWidth = React.useRef(0);

  React.useEffect(() => {
    if (!scrollable) return;
    const layout = layouts.current[activeKey];
    if (!layout || !viewportWidth.current) return;
    // A third of the viewport of lead-in, so the active tab does not sit flush against the edge
    // looking like the end of the list.
    const lead = viewportWidth.current / 3;
    scrollRef.current?.scrollTo({ x: Math.max(0, layout.x - lead), animated: true });
  }, [activeKey, scrollable]);

  const renderContent = () => (
    <View
      className={`flex-row items-center border-b border-slate-200 dark:border-white/10 ${
        variant === 'pill' ? 'border-b-0 gap-2' : ''
      } ${className}`}
    >
      {items.map((tab) => {
        const isActive = tab.key === activeKey;

        if (variant === 'pill') {
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => onChange(tab.key)}
              disabled={isActive || tab.disabled}
              onLayout={e => {
                layouts.current[tab.key] = {
                  x: e.nativeEvent.layout.x,
                  width: e.nativeEvent.layout.width,
                };
              }}
              className={`px-4 py-2 rounded-xl flex-row items-center gap-2 min-h-[44px] active:opacity-80 ${
                isActive
                  ? 'bg-brand-orange/10 dark:bg-brand-orange/20 border border-brand-orange/40'
                  : 'bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-white/5'
              } ${tab.disabled ? 'opacity-40' : ''}`}
            >
              {tab.leading ? tab.leading : tab.icon && (
                <Ionicons
                  name={tab.icon}
                  size={16}
                  color={isActive ? COLORS.brand.orange : getThemeColor(isDark, 'textSecondary')}
                />
              )}
              <View className="min-w-0">
                <Text
                  className={`font-inter-bold text-xs ${
                    isActive ? 'text-brand-orange' : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tab.label}
                </Text>
                {!!tab.sublabel && (
                  <Text
                    numberOfLines={1}
                    className={`font-inter-bold text-[9px] mt-0.5 ${
                      isActive ? 'text-brand-orange/80' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {tab.sublabel}
                  </Text>
                )}
              </View>
              {tab.badge !== undefined ? (
                <View className={`px-1.5 py-0.5 rounded-full ${isActive ? 'bg-brand-orange' : 'bg-slate-300 dark:bg-slate-700'}`}>
                  <Text className={`text-[10px] font-inter-bold ${isActive ? 'text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                    {tab.badge}
                  </Text>
                </View>
              ) : tab.dot ? (
                <View className="w-1.5 h-1.5 rounded-full bg-brand-orange" />
              ) : null}
            </TouchableOpacity>
          );
        }

        // Default 'underline' variant
        return (
          <TouchableOpacity
            key={tab.key}
            onPress={() => onChange(tab.key)}
            disabled={isActive || tab.disabled}
            onLayout={e => {
              layouts.current[tab.key] = {
                x: e.nativeEvent.layout.x,
                width: e.nativeEvent.layout.width,
              };
            }}
            className={`flex-1 py-3 px-2 flex-row items-center justify-center gap-2 relative min-h-[44px] active:opacity-80 ${
              tab.disabled ? 'opacity-40' : ''
            }`}
          >
            {tab.leading ? tab.leading : tab.icon && (
              <Ionicons
                name={tab.icon}
                size={16}
                color={isActive ? COLORS.brand.orange : getThemeColor(isDark, 'textSecondary')}
              />
            )}
            <View className="min-w-0 flex-shrink">
              <Text
                className={`font-inter-bold text-xs text-center ${
                  isActive ? 'text-brand-orange' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {tab.label}
              </Text>
              {!!tab.sublabel && (
                <Text
                  numberOfLines={1}
                  className={`font-inter-bold text-[9px] text-center mt-0.5 ${
                    isActive ? 'text-brand-orange/80' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {tab.sublabel}
                </Text>
              )}
            </View>
            {tab.badge !== undefined ? (
              <View className={`px-1.5 py-0.5 rounded-full ${isActive ? 'bg-brand-orange/20' : 'bg-slate-200 dark:bg-slate-800'}`}>
                <Text className={`text-[10px] font-inter-bold ${isActive ? 'text-brand-orange' : 'text-slate-600 dark:text-slate-400'}`}>
                  {tab.badge}
                </Text>
              </View>
            ) : tab.dot ? (
              <View className="w-1.5 h-1.5 rounded-full bg-brand-orange" />
            ) : null}
            {/* Active bottom underline indicator */}
            {isActive && (
              <View className="absolute bottom-0 left-2 right-2 h-0.5 bg-brand-orange rounded-full" />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  if (scrollable) {
    return (
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={e => {
          viewportWidth.current = e.nativeEvent.layout.width;
        }}
      >
        {renderContent()}
      </ScrollView>
    );
  }

  return renderContent();
}
