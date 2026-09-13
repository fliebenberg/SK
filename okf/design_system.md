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
timestamp: 2026-09-13T00:00:00Z
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

*   **The top of a pushed screen**: Use [`<ScreenHeader>`](file:///c:/Fred/Coding/SK/expo-app/components/ScreenHeader.tsx) — back control on the left, screen name centred, an optional action on the right. It takes `onBack` rather than an href, because a screen with unsaved edits routes back through `confirmThenNavigate` and one without routes through [`useSafeBack`](file:///c:/Fred/Coding/SK/expo-app/hooks/useSafeBack.ts), and the component should not know which. The right slot defaults to a fixed-width spacer and needs to stay one: the title is centred in the row, so without a counterweight it drifts as the label changes. Extracted 2026-09-13 (U48) rather than writing the same eighteen lines four more times; `UI-10` tracks the screens still holding their own copy. The event screen joined them the same day (U49), and is the worked example of the `right` slot carrying something real — an `<OverflowMenu>` rather than a spacer.

*   **A form split across several screens**: Each screen owns its dirty state, its own `<FloatingSaveBar>`, and **only its own fields in the write** — see the tournament setup steps (U48). The rule above still holds inside a screen; what this adds is the rule between them. `UPDATE_EVENT`-style actions are patches, so a screen writing only what it edits cannot clobber a sibling's fields — but a **JSONB column is replaced, not merged**, so any screen touching one must spread the existing object or it silently drops what another screen wrote there. Every such screen must also clear the unsaved-changes store on a successful save, or it stays dirty and the next navigation raises a discard dialog over changes already written.

*   **The rarely-wanted actions on a screen**: Put them behind [`<OverflowMenu>`](file:///c:/Fred/Coding/SK/expo-app/components/OverflowMenu.tsx) in the header — a `⋯` control opening a modal sheet of items, each with an icon, an optional description, and a `destructive` flag that tints it red and rules it off from the rest. Added 2026-09-13 (U49) to get the event's danger zone out of the bottom of the tournament setup checklist: destructive actions belong to the *record*, not to one tab of it, and a set-up flow should not end on a red box offering to delete the thing being set up. **It is a modal, not a positioned popover, deliberately** — a header sits inside tab strips and scroll views, so an absolutely-positioned dropdown is clipped by whichever ancestor hides overflow on whichever platform; a modal has no ancestors, and the no-native-dialogs rule above already requires a custom overlay. It replaces the button only: the `<ConfirmationModal>` that actually protects the record still belongs to the screen.

*   **Saying when something is**: One home — [utils/dates.ts](file:///c:/Fred/Coding/SK/expo-app/utils/dates.ts) — and two shapes, which are not the same job. A **calendar date or range** (an event, a league season) has no time of day: `formatDateRange` writes it out and collapses what the ends share (`19–21 Sep 2026`, not `19 Sep 2026 – 21 Sep 2026`), and `dateCountdown` adds how far off it is (`· in 6 days`), which is the half of "when" a bare date never answers. A **fixture's kick-off** is an instant and may be TBD: `formatFixtureWhen`. Never `.split('T')` — that is the rule the [date-formatting skill](file:///c:/Fred/Coding/SK/.agent/skills/date-formatting/SKILL.md) exists for, and the skill points back at this file: anything it does not do yet is **added to it**, never written inline in a screen. `date-fns` is not used — it is a dependency of the deprecated `client/` alone (`UI-12`). It stays in `expo-app/utils/` rather than `shared/` because these functions read the viewer's locale, timezone and "now", and the server renders no dates for humans; a server importing them would format a kick-off in the server's timezone. Consolidated 2026-09-13 (U49) from four renderings of the same idea, two of which sat one tap apart and disagreed — the events list card built its own range while the event screen behind it printed raw ISO, and the leagues screen showed a season as `2026-09-19 to 2026-12-15`. **Event and season dates are calendar dates stored at noon UTC** by the screens that write them, so `new Date(iso)` through local getters is correct for them and midday is what keeps the day intact from UTC-11 to UTC+11; anything writing one must keep the convention.

*   **A section that opens and closes**: There is no shared component. `<AccordionHeader>` was added 2026-09-08 for the tournament Setup tab and deleted 2026-09-13 when U48 gave each setup step its own screen, taking its only consumer with it — and with it the `stickyHeaderIndices` flat-children constraint and the `position: sticky` web tree with descending z-indices that pinning a heading needed on two platforms. The sports editor's [`Collapsible`](file:///c:/Fred/Coding/SK/expo-app/components/admin/sports/editorPrimitives.tsx) is now the only one and is self-contained, which is what closed `UI-5`. **Before reaching for an accordion again, check the work is not really a screen**: the Setup tab reached six sections on a phone before that was obvious.

## NativeWind v4 & React Native Styling Constraints

To avoid dynamic runtime component upgrade warnings and navigation context serialization crashes:
*   **No Tailwind Pseudo-Classes**: Do not use `active:`, `hover:`, `focus:`, `group-hover:`, or `transition-all` on native components (`TouchableOpacity`, `Pressable`, `View`). Use native component props (`activeOpacity={0.8}`) or state-driven classes.
*   **No `truncate` on `<Text>`**: Use the native `numberOfLines={1}` prop on `<Text>` components instead.
*   **No CSS Ring Utilities**: Avoid `ring-2`, `ring-4`, or ring color classes; use standard `border-2 border-brand-orange` or `border-4`.
*   **No CSS Sibling Spacing Utilities**: Avoid `space-x-*` or `space-y-*` on native views as sibling selectors (`> * + *`) force runtime component upgrades in NativeWind v4. Use native Flexbox gap properties (`gap-2`, `gap-4`, `gap-6`) instead.
*   **No Web Layout/Alignment Utility Classes**: Avoid `mx-auto`, `my-auto`, `sticky`, or unsupported shadow tiers (`shadow-2xl`, `shadow-xs`). Never inject `shadow-*` inside dynamic template strings (`${isActive ? 'shadow-sm' : ''}`), as dynamic shadow toggles force NativeWind to invoke `createAnimatedComponent` at runtime, crashing navigation context. Use static shadows or border/background state indicators instead.
*   **Animate with [`<AnimatedBox>`](file:///c:/Fred/Coding/SK/expo-app/components/AnimatedBox.tsx), never `Animated.View` directly**: a `className` on an `Animated.*` component does nothing — NativeWind's interop swaps components by *type* and no animated component is in its map, and `react-native-web` does not forward a raw `className` either, so the classes vanish on web and native alike with no warning. `AnimatedBox` puts the animation on the animated node and the classes on a plain `<View>` inside it; given neither `className` nor `innerStyle` it renders a bare animated node, so it also suits the inline-styled case where children must position against the animated node itself. That makes the rule exceptionless and greppable — a `<Animated.` anywhere outside `AnimatedBox.tsx` is a bug. Animate with React Native's `Animated` ([architecture.md](file:///c:/Fred/Coding/SK/okf/architecture.md) rule 2), not Reanimated and not NativeWind `transition-*`; a raw CSS `transition` shorthand in an inline style is not a `react-native-web` style property and silently does nothing. `useNativeDriver` must be `false` for anything driving layout (width, height, margins), and is moot on web, which has no native driver. `UI-7` records why `Animated.View` is deliberately **not** registered with `cssInterop` app-wide.
*   **Guard Web DOM Props**: Do not pass HTML5 web props (`onDragOver`, `onDrop`, `onDragStart`, `draggable`) to native components unless guarded by `Platform.OS === 'web'`.



