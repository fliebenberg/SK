import React, { useRef, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme, useSettingsStore } from '../store/settingsStore';
import { COLORS, getThemeColor } from '../constants/Colors';

/**
 * A field's label, and the explanation the field needs the first few times and never again.
 *
 * Admin forms have a genuine conflict in them: the copy that makes a field learnable is the copy
 * that makes the screen unreadable once you have learned it. The tournament facilities picker is
 * the case that prompted this (U49) — three lines about pins on a map, correct and necessary the
 * first time, pure noise to somebody setting up their ninth tournament.
 *
 * **One durable preference, not one per field.** The first cut of this remembered a dismissal
 * against every field key, and that was the wrong model. What a reader learns is not "this
 * particular paragraph is finished with" — it is *that the icon holds an explanation*, once, for
 * the whole app. After that, showing any of them by default is the thing they want switched off.
 * So the durable control is a single setting, `showFieldHelp`, and the per-field toggle is
 * deliberately **ephemeral**: a peek at a field whose help is off, or a tuck-away of one that is in
 * the way, lasting as long as the screen is open. Predictable beats clever — a form whose fields
 * each remember a different answer is a form nobody can reason about.
 *
 * **The icon says how to put it away.** An icon that is merely *filled* does not tell anyone it can
 * be pressed again, so while the help is showing the control reads `ⓘ Hide`. The icon never moves:
 * pressing takes the word away and leaves the icon exactly where it was, so the connection between
 * the two is seen rather than inferred.
 *
 * **The global switch is offered at the moment and the place of intent.** The first time anybody
 * hides a field's help they have just expressed "I do not want this", which is the one moment when
 * "you can have that everywhere" will land. So the offer appears in the space the help just left,
 * with the two answers as its only controls — and it is *actionable*: turning field help off
 * happens there rather than being described as something to go and find in Settings.
 *
 * **Not a modal, and so it needs no "do not show me this again".** A blocking dialog is a heavy
 * answer to a light act, and a dialog that has to offer its own suppression checkbox is usually a
 * dialog that should not have been blocking. Answering this one *is* the suppression: either reply
 * records that the offer has been made, and it is never shown again. A prompt that appears where
 * the reader is already looking does not need to seize the screen to be seen.
 *
 * **Hover is an extra, never the only way in.** On web, hovering the icon shows the text in a
 * bubble without disturbing the layout. There is no hover on a touch screen and none in a screen
 * reader, so pressing always works, and the bubble is suppressed whenever the help is already
 * inline — which would otherwise say the same thing twice, an inch apart.
 *
 * **The bubble is drawn inline, and a `<Modal>` was tried first and was wrong.** React Native Web's
 * Modal is a focus-trapping dialog: it appends a div to `document.body` on every mount and calls
 * `focus()` on its content. Focusing moved the page under the pointer, hover-out fired, the modal
 * unmounted, hover-in fired again — a flicker loop, several times a second. A dialog built to seize
 * focus is the wrong primitive for something that appears because a mouse passed over it.
 *
 * So it is an ordinary absolutely-positioned view, and the stacking problem it was meant to solve
 * turned out to be a **stale z-index rather than a real conflict**: the `Based at` field wrapped
 * itself in `zIndex: 30` for a dropdown that `CustomSelect` has since moved into a modal of its
 * own, so the value protected nothing and existed only to create a stacking context this bubble
 * had to lose to. Removing it is the fix; raising this subtree while hovered keeps it above
 * ordinary siblings.
 *
 * The icon is still **measured in window coordinates**, because that is what lets the bubble
 * **flip below** a label near the top of the screen and **clamp** to the viewport instead of
 * hanging off an edge — the other half of the original report.
 *
 * **It starts at the label, not centred on the icon** (2026-09-19). Centring was clamped to the
 * *window*, but the form sits in a scroll view beside the sidebar, and a scroll view clips what
 * overflows it. A short label — `Sport` — puts the icon near the column's left edge, so half a
 * centred bubble went past the scroll view and was cut off: the text appeared to start outside its
 * box. The window was never the edge that mattered, and the one that does is not measurable from
 * here. What is always true is that a label sits at the left of its own field, so a bubble aligned
 * to the label and running right stays over the form wherever the field is; it is only pulled back
 * when it would pass the window's right edge.
 */

const BUBBLE_WIDTH = 260;
const BUBBLE_GAP = 8;
const BUBBLE_MARGIN = 8;
/** Below this much room overhead, the bubble flips under the icon instead. */
const MIN_SPACE_ABOVE = 120;

/** One stored flag: whether the "hide these everywhere?" offer has already been made. */
const HINT_SEEN_KEY = 'fieldHelpHintSeen';

/**
 * Whether form field help shows by default. On unless the reader has turned it off.
 *
 * Read the same way `settings.tsx` reads haptics — a local override wins over the account-level
 * default — so it is remembered per device, like every other preference this store persists.
 */
export function useShowFieldHelp(): boolean {
  return useSettingsStore(
    (state: any) =>
      state.localOverrides.showFieldHelp ?? state.globalPreferences.showFieldHelp ?? true
  );
}

export interface FieldLabelProps {
  label: string;
  /**
   * The explanation. No `help` renders no icon — a self-evident field costs nothing, and the icon
   * keeps meaning "there is more to say about this one" rather than becoming furniture.
   */
  help?: string;
  /** Marks the field as required, for the few that are. */
  required?: boolean;
  /**
   * Marks the field as one that may be left empty, with a quiet `Optional` after the label.
   *
   * For forms where most fields are needed or filled in for you, so the exceptions are the ones
   * worth naming — the division screen, where the name fills itself in and the sport is always set,
   * but an age group and organisers are genuinely optional. Saying so beats an asterisk on every
   * other field, which reads as a form full of demands.
   */
  optional?: boolean;
}

export function FieldLabel({ label, help, required, optional }: FieldLabelProps) {
  const isDark = useActiveTheme() === 'dark';
  const showByDefault = useShowFieldHelp();
  const setLocalOverride = useSettingsStore((state: any) => state.setLocalOverride);
  const hintSeen = useSettingsStore((state: any) => state.localOverrides[HINT_SEEN_KEY] === true);

  const [override, setOverride] = useState<boolean | null>(null);
  const [offering, setOffering] = useState(false);
  const [hovered, setHovered] = useState(false);
  /** Where the icon is in the window — only ever used to decide flip and clamp. */
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number } | null>(null);
  /** How far the icon sits from the start of the label, so the bubble can begin where the label does. */
  const [iconOffset, setIconOffset] = useState(0);
  const iconRef = useRef<View>(null);
  const { width: screenWidth } = useWindowDimensions();

  const hasHelp = !!help;
  const isShowing = hasHelp && (override ?? showByDefault);

  const toggle = () => {
    /* Hiding, with the setting still on and the offer never made, is the one moment it is worth
       making. Showing is not: somebody opening a field's help is not asking to switch it all off. */
    if (isShowing && showByDefault && !hintSeen) setOffering(true);
    setOverride(!isShowing);
  };

  /** Either answer settles it for good — which is what replaces a "do not show this again" box. */
  const answerOffer = (hideEverywhere: boolean) => {
    setLocalOverride(HINT_SEEN_KEY, true);
    if (hideEverywhere) setLocalOverride('showFieldHelp', false);
    setOffering(false);
  };

  /**
   * Where the bubble sits, relative to the icon.
   *
   * Vertically: above by default, flipped below when the icon is too near the top of the window for
   * a bubble to fit overhead. Horizontally: its left edge on the label's left edge, running right,
   * and pulled back only if that would pass the window's right edge — expressed as an offset from
   * the icon, since that is what it is positioned against.
   */
  const bubbleWidth = Math.min(BUBBLE_WIDTH, screenWidth - BUBBLE_MARGIN * 2);
  const labelAlignedLeft = -iconOffset;
  const bubblePosition = anchor
    ? {
        left: Math.min(
          labelAlignedLeft,
          screenWidth - BUBBLE_MARGIN - bubbleWidth - anchor.x
        ),
        ...(anchor.y >= MIN_SPACE_ABOVE ? { bottom: BUBBLE_GAP + 16 } : { top: BUBBLE_GAP + 16 }),
      }
    : { left: labelAlignedLeft, bottom: BUBBLE_GAP + 16 };

  return (
    <View
      className="gap-1.5"
      /* Lifts the whole label, bubble included, above ordinary siblings while it is showing. */
      style={hovered ? { zIndex: 50 } : undefined}
    >
      <View className="flex-row items-center gap-1.5">
        <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {label}
        </Text>
        {required && <Text className="font-inter text-[10px] text-brand-orange">*</Text>}
        {optional && (
          <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400">Optional</Text>
        )}

        {hasHelp && (
          <Pressable
            ref={iconRef}
            onPress={toggle}
            onHoverIn={() => {
              setHovered(true);
              iconRef.current?.measureInWindow((x, y, width) => setAnchor({ x, y, width }));
            }}
            onHoverOut={() => setHovered(false)}
            onLayout={event => setIconOffset(event.nativeEvent.layout.x)}
            accessibilityRole="button"
            accessibilityLabel={`${isShowing ? 'Hide' : 'Show'} help for ${label}`}
            accessibilityHint={help}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            className="flex-row items-center gap-1"
          >
            <Ionicons
              name={isShowing ? 'information-circle' : 'information-circle-outline'}
              size={14}
              color={isShowing ? COLORS.brand.orange : getThemeColor(isDark, 'textSecondary')}
            />
            {/* The word that teaches the button, and the only thing pressing removes — the icon
                stays put, so nobody has to work out where it went. */}
            {isShowing && (
              <Text className="font-inter text-[10px] uppercase tracking-wider text-brand-orange">
                Hide
              </Text>
            )}

            {hovered && !isShowing && (
              <View
                className="absolute bg-slate-900 dark:bg-slate-700 rounded-lg px-3 py-2 shadow-lg"
                style={{ width: bubbleWidth, ...bubblePosition }}
                pointerEvents="none"
              >
                <Text className="font-inter text-[11px] leading-relaxed text-white">{help}</Text>
              </View>
            )}
          </Pressable>
        )}
      </View>

      {isShowing && (
        <Text className="font-inter text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          {help}
        </Text>
      )}

      {/* Offered in the space the help just left, so it is read where the reader already is. */}
      {offering && !isShowing && (
        <View className="rounded-xl border border-brand-orange/30 bg-brand-orange/5 dark:bg-brand-orange/10 px-3 py-2.5 gap-2">
          <Text className="font-inter text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
            Hidden while you are on this screen. Would you like to hide field help on every admin
            form? You can always press the info icon to read it, and change this in Settings.
          </Text>
          <View className="flex-row items-center gap-4">
            <Pressable
              onPress={() => answerOffer(true)}
              accessibilityRole="button"
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              <Text className="font-inter-bold text-[10px] uppercase tracking-wider text-brand-orange">
                Hide everywhere
              </Text>
            </Pressable>
            <Pressable
              onPress={() => answerOffer(false)}
              accessibilityRole="button"
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              <Text className="font-inter-bold text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Keep showing it
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
