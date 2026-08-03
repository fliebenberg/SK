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
timestamp: 2026-07-02T14:56:00Z
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

## Custom Overlays & Dialogs (No Native Popups)

To maintain a consistent, premium live-sports aesthetic and prevent silent failures across multiple targets:
*   **No Native Dialogs**: Do not use platform-native alert popups (like React Native's `Alert.alert` or default browser `alert`/`confirm` dialogs) for warnings, deletions, or configuration edits.
*   **Custom Overlays**: Always design and render custom, theme-aware overlay modals (using `Modal` or inline styled cards with blur backdrops) for interactive confirm-destructive flows. This ensures proper layout, cross-compatible interaction, and blocks browser popup interceptors.

## Segmented Controls vs Action Triggers

*   **Action Triggers**: Primary actions (Save, Submit, Score Match) use solid filled brand accent buttons.
*   **Segmented View Switchers**: Multi-state view selectors (e.g. Readonly / Edit Info / Score Match, theme preference, settings sub-tabs) must be enclosed inside a single rounded track (`bg-slate-100 dark:bg-slate-900`) with elevated card indicator tiles (`bg-white dark:bg-slate-800` + `border-brand-orange/30`), distinguishing selection state from action buttons.
*   **Generic Component Reuse**: Consume the reusable `<SegmentedControl>` component (`expo-app/components/SegmentedControl.tsx`) across all view switchers and preference selectors to prevent duplicate UI code and ensure single-source-of-truth styling.

## NativeWind v4 & React Native Styling Constraints

To avoid dynamic runtime component upgrade warnings and navigation context serialization crashes:
*   **No Tailwind Pseudo-Classes**: Do not use `active:`, `hover:`, `focus:`, `group-hover:`, or `transition-all` on native components (`TouchableOpacity`, `Pressable`, `View`). Use native component props (`activeOpacity={0.8}`) or state-driven classes.
*   **No `truncate` on `<Text>`**: Use the native `numberOfLines={1}` prop on `<Text>` components instead.
*   **No CSS Ring Utilities**: Avoid `ring-2`, `ring-4`, or ring color classes; use standard `border-2 border-brand-orange` or `border-4`.
*   **No CSS Sibling Spacing Utilities**: Avoid `space-x-*` or `space-y-*` on native views as sibling selectors (`> * + *`) force runtime component upgrades in NativeWind v4. Use native Flexbox gap properties (`gap-2`, `gap-4`, `gap-6`) instead.
*   **No Web Layout/Alignment Utility Classes**: Avoid `mx-auto`, `my-auto`, `sticky`, or unsupported shadow tiers (`shadow-2xl`, `shadow-xs`). Never inject `shadow-*` inside dynamic template strings (`${isActive ? 'shadow-sm' : ''}`), as dynamic shadow toggles force NativeWind to invoke `createAnimatedComponent` at runtime, crashing navigation context. Use static shadows or border/background state indicators instead.
*   **Guard Web DOM Props**: Do not pass HTML5 web props (`onDragOver`, `onDrop`, `onDragStart`, `draggable`) to native components unless guarded by `Platform.OS === 'web'`.



