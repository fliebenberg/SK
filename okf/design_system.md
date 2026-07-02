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
