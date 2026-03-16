# ScoreKeeper UI Style Guide

This document defines the core design principles and implementation patterns for the ScoreKeeper application. It serves as a reference for developers and a set of instructions for AI agents to maintain UI consistency and excellence.

## 1. Core Philosophy

### Mobile-First & High-Density
ScoreKeeper is built for field-use (coaches, parents, referees). The UI must prioritize mobile devices without sacrificing power.
- **Zero Waste:** Reclaim every pixel of white space. Avoid large headers and redundant titles.
- **Information Hero:** Data (matches, players, stats) should be visible as early as possible in the viewport.
- **Touch-Optimized:** Use Floating Action Buttons (FABs) for primary actions and large, clickable rows instead of tiny "Manage" buttons.

### Professional Aesthetic (Pro UI)
- **Modern & Dynamic:** Use vibrant colors, harmonious gradients, and glassmorphic effects (`backdrop-blur`).
- **Identity First:** Incorporate organization logos and sport-specific iconography (Trophy, Shield, MapPin) to provide context at a glance.
- **Micro-Animations:** Use subtle hover/active states (e.g., `group-hover` translations) to make the interface feel alive.

---

## 2. Typography & Color

### Typography
- **Headers:** Use `Orbitron` (sans-serif) for all main titles, team names, and headers to give a technical, sporty feel.
- **Body:** Use `Inter` (or system default) for labels, inputs, and dense data.
- **Case:** Use **UPPERCASE** for breadcrumbs, button labels, and metadata tags (e.g., `U/13 A`).

### Color System (HSL)
We use a CSS variable-based HSL system for theme adaptability.
- `--primary`: The main brand color (usually orange).
- `--foreground`: Text color.
- `--muted-foreground`: Secondary text (50% opacity).
- `metal-gray`: Adaptive colors for the brushed metal effect.

---

## 3. Navigation Patterns

### Breadcrumb Navigation
Avoid large circular back buttons that disrupt the header alignment.
- **Pattern:** `← BACK TO [SECTION]`
- **Implementation:** Small, uppercase, muted-foreground link placed directly above the main title.
- **Mobile Rule:** Breadcrumbs are preferred over sticky headers with back arrows.

### Admin Tabs
Use the `AdminTabs` component for sub-navigation (e.g., Team Details vs Events).
- **Mobile Density:** Tabs should have minimal padding on mobile to stay on one row or allow horizontal scrolling.

---

## 4. Layout & Spacing

### Global Padding
Nested padding is the enemy of mobile density.
- **Root Layout:** `px-1.5 py-2` on mobile; `p-8` on desktop.
- **Page Container:** Use `p-0` on mobile inside the main layout to allow content to sit nearly edge-to-edge.
- **Gaps:** Use `space-y-1` or `gap-2` for most mobile lists.

### Responsive Grids
- **Filters:** Sit side-by-side (50/50) or in a single row with the search input on mobile.
- **Forms:** Labels should be small and uppercase; inputs should have tight vertical spacing.

---

## 5. UI Components

### MetalButton
The primary button for ScoreKeeper.
- **Effective Variants:**
  - `variantType="filled"`: Solid brand color (use for high-priority like "Save" or "Add").
  - `variantType="outlined"`: Metal look with a glowing border (use for secondary actions).
- **Icons:** Always use the `icon` prop instead of children for proper spacing.
- **Mobile FAB:** For "Add" actions, use a `MetalButton` with `size="icon"` in a fixed bottom-right position.

### MetalCard
Used for wrapping sections of data or forms.
- **Spacing:** Use reduced padding (`p-4`) on mobile.

### MatchCard
A specialized component for displaying head-to-head games.
- **Logic:** Should resolve team names automatically and show date/time/site info in a compact side-badge.

---

## 6. Optimization Checklist for AI Agents

When creating or modifying a page, ensure:
- [ ] No duplicate titles between the layout and the page.
- [ ] Breadcrumb navigation implemented above the H1.
- [ ] Search and Filter items sit on one row if possible (use icons for toggles on mobile).
- [ ] Primary mobile action is a FAB if appropriate.
- [ ] "Save/Discard" button blocks stack on mobile (`flex-col md:flex-row`).
- [ ] Side margins on mobile are minimal (`px-1.5` or `px-2`).
- [ ] Header font is `var(--font-orbitron)`.
