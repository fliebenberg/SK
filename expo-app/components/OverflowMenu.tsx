import React, { useState } from 'react';
import { Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../store/settingsStore';
import { COLORS, getThemeColor } from '../constants/Colors';

/**
 * The rarely-wanted actions on a screen, behind one control in its header.
 *
 * Added 2026-09-13 (U49) to get the event's danger zone off the bottom of the setup checklist,
 * where it had been since U48. Two things were wrong with it there. It made the last thing an
 * organiser scrolled past on the *setup* page — the page whose whole job is getting a tournament
 * ready — a red box offering to cancel and delete it, which is a strange note for a set-up flow to
 * end on. And it lived on one tab of three, so cancelling an event was reachable from Setup and
 * nowhere else, even though it has nothing to do with setup.
 *
 * **A modal, not a popover.** [okf/design_system.md](file:///c:/Fred/Coding/SK/okf/design_system.md)
 * bans native dialogs and prescribes custom overlays, and an absolutely-positioned dropdown inside
 * a header is the other thing that would have worked — but that header sits inside a `ScrollView`
 * and a tab strip, so the menu would be clipped by whichever ancestor has `overflow: hidden` on
 * whichever platform. A modal has no ancestors.
 *
 * **Destructive items are marked, not hidden.** A `destructive` item takes the brand red and sits
 * under a divider, which is enough separation for a menu of two or three; the confirmation that
 * actually protects the record is the caller's `<ConfirmationModal>`, unchanged — this only
 * decides where the button that opens it lives.
 */
export interface OverflowMenuItem {
  label: string;
  /** A line under the label saying what it does. Optional; most items do not need one. */
  description?: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface OverflowMenuProps {
  items: OverflowMenuItem[];
  /** Named for screen readers — "Event actions", "Team actions". */
  accessibilityLabel?: string;
  /** Heading inside the sheet. Omitted renders no heading. */
  title?: string;
}

export function OverflowMenu({
  items,
  accessibilityLabel = 'More actions',
  title,
}: OverflowMenuProps) {
  const isDark = useActiveTheme() === 'dark';
  const [isOpen, setIsOpen] = useState(false);
  const secondary = getThemeColor(isDark, 'textSecondary');

  if (items.length === 0) return null;

  /** Close first, then act — so a sheet never sits over the confirmation the item opens. */
  const run = (item: OverflowMenuItem) => {
    if (item.disabled) return;
    setIsOpen(false);
    item.onPress();
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setIsOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        activeOpacity={0.7}
        className="w-10 h-10 items-center justify-center rounded-full"
      >
        <Ionicons name="ellipsis-horizontal" size={20} color={secondary} />
      </TouchableOpacity>

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        {/* The scrim closes the menu, which is what a tap outside a menu means everywhere. */}
        <Pressable
          onPress={() => setIsOpen(false)}
          className="flex-1 bg-black/60 items-center justify-center px-6"
        >
          {/* Swallows the tap so pressing the card itself does not close it. */}
          <Pressable
            onPress={() => {}}
            className="w-full max-w-sm rounded-2xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10"
          >
            {!!title && (
              <View className="px-5 pt-4 pb-3 border-b border-slate-100 dark:border-white/5">
                <Text className="font-orbitron-bold text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  {title}
                </Text>
              </View>
            )}

            {items.map((item, index) => {
              const tint = item.destructive ? COLORS.brand.red : secondary;
              const firstDestructive =
                item.destructive && !items[index - 1]?.destructive && index > 0;

              return (
                <TouchableOpacity
                  key={item.label}
                  onPress={() => run(item)}
                  disabled={item.disabled}
                  accessibilityRole="button"
                  activeOpacity={0.75}
                  className={`flex-row items-center gap-3.5 px-5 py-4 min-h-[56px] ${
                    firstDestructive ? 'border-t border-slate-100 dark:border-white/5' : ''
                  } ${item.disabled ? 'opacity-40' : ''}`}
                >
                  <Ionicons name={item.icon} size={18} color={tint} />
                  <View className="flex-1 min-w-0">
                    <Text
                      className={`font-inter-bold text-sm ${
                        item.destructive ? 'text-brand-red' : 'text-slate-800 dark:text-white'
                      }`}
                    >
                      {item.label}
                    </Text>
                    {!!item.description && (
                      <Text
                        className="font-inter text-xs mt-0.5 text-slate-500 dark:text-slate-400"
                        numberOfLines={2}
                      >
                        {item.description}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              onPress={() => setIsOpen(false)}
              accessibilityRole="button"
              activeOpacity={0.75}
              className="px-5 py-3.5 items-center border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/5"
            >
              <Text className="font-inter-bold text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Close
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
