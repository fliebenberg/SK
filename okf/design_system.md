---
type: concept
title: Design System & Styling Rules
description: Styling tokens, core themes, typography rules, layout grids, and accessibility requirements.
tags:
  - concept
  - design-system
  - styling
  - theme
  - accessibility
timestamp: 2026-09-09T00:00:00Z
---

# Design System & Styling Rules

ScoreKeeper features a premium, dark-mode-first aesthetic inspired by modern live sports interfaces, with deep contrasts and high-energy accents.

For the full detailed design principles, see [design_spec.md](file:///c:/Fred/Coding/SK/docs/design_spec.md).

## Theme Colors & Variables

All theme colors must be referenced using the centralized [Colors.ts](file:///c:/Fred/Coding/SK/expo-app/constants/Colors.ts) configuration and the `getThemeColor(isDark, key)` helper. **Hardcoded hex codes (e.g. `#FF3E00`) or raw rgba strings are strictly prohibited** in markup or styles.

*   **Backgrounds**: Slate and pure blacks (`#0F172A`, `#000000`).
*   **Surfaces/Cards**: Translucent dark surfaces (`rgba(255, 255, 255, 0.05)` with `backdrop-filter: blur(10px)`).
*   **Primary Accent**: **Electric Orange** (`#FF3E00`). Used for primary actions, active tabs, and logo glows.
*   **Secondary Accent**: **Electric Blue** (`#00E5FF`). Used for secondary elements, links, and data visualizers in Dark Mode.
*   **Alert Accent**: **Pure Neon Red** (`#FF003C`). Used for live badges and warnings.
*   **Success Accent**: **Emerald Green** (`#00E676`). Used for won/success states.

## Typography

*   **Orbitron** (Geometric digital font): Used exclusively for numbers, scoreboards, match clocks, and the main app logo.
*   **Inter / Roboto**: Used for all standard body text, participant rosters, and smaller UI labels.

## Grid & Layouts

*   **8-Point Grid**: All spacing, margins, padding, and layout bounds must align to an 8-point grid (8, 16, 24, 32, etc.).
*   **Card Padding**: Standard containers use `16px` or `24px` internal padding.

## Light Mode AAA Accessibility Rules

Because `#00E5FF` has a low contrast ratio (1.25:1) on white/light backgrounds, all ghost buttons, text links, and role badges must adaptively swap to **Deep Slate** (`text-slate-700` / `#334155`) or **Deep Ocean Cyan** (`text-cyan-800` / `#155e75`) when Light Mode is active, ensuring a **7.6:1+ contrast ratio** (AAA compliance).

The same rule binds the success green: `#00E676` scores **1.67:1** on white, so text, functional icons and meaningful fills swap to **Deep Emerald** (`text-emerald-800` / `#065F46`, **7.7:1**) in Light Mode — the `success` token in [Colors.ts](file:///c:/Fred/Coding/SK/expo-app/constants/Colors.ts). A bare `text-brand-green` is a light-mode contrast bug wherever it carries meaning; see [design_spec §1.1](file:///c:/Fred/Coding/SK/docs/design_spec.md).

## Custom Overlays & Dialogs (No Native Popups)

To maintain a consistent, premium live-sports aesthetic and prevent silent failures across multiple targets:
*   **No Native Dialogs**: Do not use platform-native alert popups (like React Native's `Alert.alert` or default browser `alert`/`confirm` dialogs) for warnings, deletions, or configuration edits.
*   **Custom Overlays**: Always design and render custom, theme-aware overlay modals (using `Modal` or inline styled cards with blur backdrops) for interactive confirm-destructive flows. This ensures proper layout, cross-compatible interaction, and blocks browser popup interceptors.

## Segmented Controls vs Action Triggers

*   **Action Triggers**: Primary actions (Save, Submit, Score Match) use solid filled brand accent buttons.
*   **Segmented View Switchers**: Multi-state view selectors (e.g. Readonly / Edit Info / Score Match, theme preference, settings sub-tabs) must be enclosed inside a single rounded track (`bg-slate-100 dark:bg-slate-900`) with elevated card indicator tiles (`bg-white dark:bg-slate-800` + `border-brand-orange/30`), distinguishing selection state from action buttons.
*   **Generic Component Reuse**: Consume the reusable `<SegmentedControl>` component (`expo-app/components/SegmentedControl.tsx`) across all view switchers and preference selectors to prevent duplicate UI code and ensure single-source-of-truth styling.

## One Component Per Repeated Concept

*   **A side of a fixture**: Render it with [`<FixtureSide>`](file:///c:/Fred/Coding/SK/expo-app/components/FixtureSide.tsx), never with ad-hoc text. A side is in one of three states — a known competitor, an entrant awaiting confirmation ("TBC — awaiting confirmation"), or a slot awaiting a result ("Winner QF1") — and the fixtures list, the schedule, the bracket, the game screen, the standings and anything printed all show them. Five independent renderings of "TBC" is a guaranteed inconsistency. The wording itself is derived in [`shared/src/utils/fixtureSide.ts`](file:///c:/Fred/Coding/SK/shared/src/utils/fixtureSide.ts), so the server and print paths say the same thing the screen does; a placeholder is drawn in secondary text (AAA in Light Mode) rather than at a lower opacity, so it stays legible.

*   **Saving an edited record**: Every admin screen that edits a record in place saves through [`<FloatingSaveBar>`](file:///c:/Fred/Coding/SK/expo-app/components/FloatingSaveBar.tsx) — a card pinned to the bottom of the screen once the form is dirty, naming what changed and carrying Cancel and Save. Never a save button under a section: a screen with two of them is a screen with two writes to one row. Three things go together and the component's doc comment says so — the bar, `useUnsavedChanges(isDirty, onCancel)` so that leaving warns and *discarding* runs the same reset Cancel does, and `paddingBottom: isDirty ? FLOATING_SAVE_BAR_PADDING : 60` on the scroll container so the bar never covers the last field. Extracted 2026-09-08 from nine screens that had each copy-pasted it; `UI-3` tracks moving those nine onto it.

*   **A section that opens and closes**: Use [`<AccordionHeader>`](file:///c:/Fred/Coding/SK/expo-app/components/Accordion.tsx), with open/closed state owned by the screen rather than the component. **Pinning the heading takes a different tree on each platform**, because a pinned row must be *pushed off* by the next section's row and never covered by it. On **native**, render the panel as the header's **sibling** and name the header's index in `stickyHeaderIndices`, which can pin only a direct child of the scroll and whose implementation does the push by watching the next header's offset; the scroll's children must then be built as a **flat array with no `false` or `null` entries** (native indexes through `React.Children.toArray`, which strips falsy children and re-indexes, while `react-native-web` uses `React.Children.map`, which does not, so a conditional sibling pins a different row on each platform). On **web**, pass `sticky` and wrap each header **with** its panel in one container: `position: sticky` is bounded by its containing block, so the section's own bottom edge shoves the header out. Give those wrappers **descending z-indices** — every `react-native-web` `View` is its own stacking context (`position: relative; z-index: 0`), so without them a later section's content paints over the pinned header it should slide under. Do **not** use `stickyHeaderIndices` on web: it is implemented there as `top: 0` on siblings of one container, which pins every header to the same line and lets the later one paint over the earlier. **An open section is one card, heading included**: an expanded row drops its bottom radius and bottom border (the component does this off `expanded`) and the panel repeats the row's surface and closes it with `rounded-b-2xl`, so nothing floats below an unrelated-looking heading. Groups inside the panel divide with a hairline `border-t` — do not put them in `<GlassCard>`s, which nests a card in a card. Added 2026-09-08 for the tournament Setup tab, corrected 2026-09-09; `UI-5` covers the sports editor's older `Collapsible`.

## NativeWind v4 & React Native Styling Constraints

To avoid dynamic runtime component upgrade warnings and navigation context serialization crashes:
*   **No Tailwind Pseudo-Classes**: Do not use `active:`, `hover:`, `focus:`, `group-hover:`, or `transition-all` on native components (`TouchableOpacity`, `Pressable`, `View`). Use native component props (`activeOpacity={0.8}`) or state-driven classes.
*   **No `truncate` on `<Text>`**: Use the native `numberOfLines={1}` prop on `<Text>` components instead.
*   **No CSS Ring Utilities**: Avoid `ring-2`, `ring-4`, or ring color classes; use standard `border-2 border-brand-orange` or `border-4`.
*   **No CSS Sibling Spacing Utilities**: Avoid `space-x-*` or `space-y-*` on native views as sibling selectors (`> * + *`) force runtime component upgrades in NativeWind v4. Use native Flexbox gap properties (`gap-2`, `gap-4`, `gap-6`) instead.
*   **No Web Layout/Alignment Utility Classes**: Avoid `mx-auto`, `my-auto`, `sticky`, or unsupported shadow tiers (`shadow-2xl`, `shadow-xs`). Never inject `shadow-*` inside dynamic template strings (`${isActive ? 'shadow-sm' : ''}`), as dynamic shadow toggles force NativeWind to invoke `createAnimatedComponent` at runtime, crashing navigation context. Use static shadows or border/background state indicators instead.
*   **Animate with [`<AnimatedBox>`](file:///c:/Fred/Coding/SK/expo-app/components/AnimatedBox.tsx), never `Animated.View` directly**: a `className` on an `Animated.*` component does nothing — NativeWind's interop swaps components by *type* and no animated component is in its map, and `react-native-web` does not forward a raw `className` either, so the classes vanish on web and native alike with no warning. `AnimatedBox` puts the animation on the animated node and the classes on a plain `<View>` inside it; given neither `className` nor `innerStyle` it renders a bare animated node, so it also suits the inline-styled case where children must position against the animated node itself. That makes the rule exceptionless and greppable — a `<Animated.` anywhere outside `AnimatedBox.tsx` is a bug. Animate with React Native's `Animated` ([architecture.md](file:///c:/Fred/Coding/SK/okf/architecture.md) rule 2), not Reanimated and not NativeWind `transition-*`; a raw CSS `transition` shorthand in an inline style is not a `react-native-web` style property and silently does nothing. `useNativeDriver` must be `false` for anything driving layout (width, height, margins), and is moot on web, which has no native driver. `UI-7` records why `Animated.View` is deliberately **not** registered with `cssInterop` app-wide.
*   **Guard Web DOM Props**: Do not pass HTML5 web props (`onDragOver`, `onDrop`, `onDragStart`, `draggable`) to native components unless guarded by `Platform.OS === 'web'`.



