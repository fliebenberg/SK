# ScoreKeeper Design Specification

This document outlines the visual and interaction design principles for the new cross-platform ScoreKeeper Expo application. It serves as a comprehensive guide for the AI agents and developers building the UI components.

## 1. Design System Architecture (Variable-Driven)
**Critical Rule**: All styling (colors, typography, spacing, border radiuses) *must* be strictly variable-driven. Whether using a Tailwind configuration file or a dedicated theme provider, no hardcoded hex codes or arbitrary spacing values should exist in component code. This ensures the entire application theme can be updated from a single central file.

In the Expo mobile app, all theme colors must be referenced using the centralized [Colors.ts](file:///c:/Fred/Coding/SK/expo-app/constants/Colors.ts) configuration and the `getThemeColor(isDark, key)` helper function (imported from `c:\Fred\Coding\SK\expo-app\constants`). Hardcoded hex strings (e.g. `'#94A3B8'`) or raw `rgba` expressions are strictly prohibited in component markup and inline styling.


## 2. Core Aesthetic: "Immersive & Dynamic" (Dark Mode First)

The application prioritizes a premium, dark-mode-first aesthetic inspired by modern live sports and esports applications (like Flashscore), with a heavy emphasis on dynamic feedback and deep contrasts.

### 1.1 Color Palette
The color system relies on a deep, dark foundation punctuated by highly saturated neon accents to guide the user's eye and convey energy. The combination of Orange and Slate provides maximum complementary contrast.
- **Backgrounds**: Deep slate and pure blacks (`#0F172A`, `#000000`). This reduces eye strain and makes bright colors pop.
- **Surfaces/Cards**: Glassmorphism effects. Translucent dark grays with subtle blurs (`rgba(255, 255, 255, 0.05)` with `backdrop-filter: blur(10px)`). 
- **Primary Accent (Brand)**: **Electric Orange** (`#FF3E00`). Used for primary buttons, active tabs, and the main logo glow. It provides a highly energetic, arena-like feel.
- **Secondary Accent**: **Electric Blue** (`#00E5FF`). Provides sharp, electric visual relief from the orange. Used for secondary buttons, data visualizations, and standard links in **Dark Mode**. 
  - *Light Mode Accessibility Rule*: Since `#00E5FF` has a failing contrast ratio (1.25:1) on white/light surfaces, all non-filled (ghost) buttons, text links, and role badges must adaptively swap to **Deep Slate** (`text-slate-700` / `#334155`) or **Deep Ocean Cyan** (`text-cyan-800` / `#155e75` with `bg-cyan-50` / `border-cyan-200` containers) in Light Mode to maintain a **7.6:1+ contrast ratio** and guarantee readability (WCAG AAA compliant).
- **Live / Alert Accent**: **Pure Neon Red** (`#FF003C`). Used exclusively for "LIVE" indicators and destructive actions (e.g., Red Cards).
- **Success Accent**: **Emerald Green** (`#00E676`). Used for positive confirmations and "Match Won" states.
- **Text**: High contrast pure white (`#FFFFFF`) for primary data, soft silver (`#94A3B8`) for secondary labels.

### 1.2 Typography
- **Primary Display Font**: **Orbitron**. This highly geometric, sci-fi/digital font will be used exclusively for prominent numerical displays (Live Scoreboards, Game Clocks) and the primary App Logo to give the app a unique, high-tech identity.
- **Body & UI Font**: A clean, modern sans-serif like **Inter** or **Roboto**. Used for all body text, participant names, and smaller UI elements to guarantee maximum readability.
- **Usage**:
  - Uncluttered, highly legible numbers for scores and clocks using Orbitron.
  - Generous negative space between text blocks to prevent the "wall of text" feeling.
  - Bold, uppercase tracking for labels and section headers (e.g., `OVERVIEW`, `STATS`).

### 1.3 Spacing & Layout Grid
- **The 8-Point Grid**: All padding, margins, and component heights must align to an 8-point grid (8, 16, 24, 32, 40, etc.) to ensure a rhythmic, mathematically consistent layout.
- **Card Padding**: Standard cards should use a generous `16px` or `24px` internal padding to give the data room to breathe.

### 1.4 Brand Identity & Logo
- **The Logo**: A prominent "SK" inside a square container, utilizing the Orbitron font.
- **Styling**: The logo must be adaptable to the active theme. In the primary Dark Mode, the "SK" letters will feature the primary glowing accent color (**Electric Orange**) and should be styled to look physically extruded (3D relief) from the dark background square.

---

## 2. Global Navigation Strategy (Hybrid Model)

Because ScoreKeeper serves two distinct user archetypes (casual viewers vs. heavy administrators), the app employs a **Hybrid Navigation Model**:

### 2.1 Viewer/Fan & Administrative Routing (Mobile Bottom Tabs -> Desktop Left Rail)
- **Mobile (< 768px)**: A **Bottom Tab Bar** is the primary navigation mechanism. To guarantee clean ergonomics and avoid clutter, the tab bar MUST NOT exceed 5 buttons:
  - **Live** (`index` tab): Real-time games feed with live scoring triggers.
  - **Orgs** (`organizations` tab): Public directory list of registered sports organizations.
  - **Teams** (`teams` tab): Public directory list of active teams and records.
  - **Sites** (`sites` tab): Public directory list of facilities and venues.
  - **Settings** (`settings` tab): PROGRAMMATIC INTERCEPTOR. Tapping the settings tab icon must not navigate directly. Instead, it must toggle a translucent backdrop-dimmed **Speed Dial Popover Menu** floating directly above the bottom tab. The popover displays:
    1. **Admin Portal** (links to `/admin` dashboard stack)
    2. **My Account** (links to `/settings` account screen)
- **Large Screens / Web (>= 768px)**: The bottom tabs automatically reposition into a **Left Navigation Rail** (similar to Twitter/X web) for direct and seamless traversal.

### 2.2 Admin Dashboard & Workspace Navigation (Mobile Drawer -> Desktop Pinned Sidebar)
For deep administrative features:
- **Mobile (< 768px)**: Handled via the `/admin` navigation stack. Pushing sub-panels (like dynamic workspaces `/admin/[orgId]`) mounts nested stack routers, keeping screen layout clean and relying on single native back routing triggers.
- **Large Screens / Web (>= 768px)**: Renders a **Persistent Pinned Left Sidebar** for workspace context switching, list panels, and settings forms.


### 2.3 Mobile Header & Back Navigation Design
To guarantee a clean, professional, and uncluttered layout on mobile viewports:
1. **Single Native Header Bar**: The application must utilize a single native navigation header bar (configured in Expo Router's `<Stack>` layout, styled with the custom Orbitron font and primary Burnt Orange accent). Double headers (such as displaying both the root stack header and a nested router header) are strictly prohibited.
2. **Prevent Heading Duplication**: Do not repeat the active screen title (e.g., "Control Center" or "My Organizations") as a large heading inside the scrollable screen body if it is already displayed in the native header above. This saves precious screen real estate on mobile devices.
3. **Standardized Back Routing**: All back navigation is handled natively by the stack header's back arrow (`<-`) or iOS edge swipe-back gestures, popping the active screen from the stack. Custom "Back" buttons must not be added to the screen body unless part of a high-friction multi-step wizard (like live scoring exit guards).

---

## 3. The Live Viewer Experience

The viewer interface must handle high-density data without feeling cluttered, combining Flashscore's compactness with FotMob's readability.

### 3.1 The Match Scoreboard
- **Compact Layout**: The header scoreboard should be vertically compact. Team logos, names, and current scores sit on a single visual plane rather than stacked excessively.
- **Subtle Live Indicators**: The "LIVE" badge should be present but small and unobtrusive, relying on a subtle glowing pulse animation to convey active status.
- **Real-Time "Blink"**: When a score changes via WebSockets, the score container should perform a quick, subtle background flash (e.g., a brief yellow or team-color pulse) to draw the eye.

### 3.2 Tabbed Navigation
- To prevent infinite vertical scrolling, use a **tabbed interface** below the main scoreboard (e.g., `Overview`, `Play-by-Play`, `Lineups`, `Stats`).
- **Styling**: Tabs should utilize a "see-through" glassmorphism effect, blending seamlessly with the dark background while highlighting the active tab with a crisp underline or glowing pill background.

### 3.3 The Live Timeline (Play-by-Play)
- **Layout**: A **Vertical Timeline** (like FotMob) running down the screen. The vertical line itself should be a subtle, translucent track.
- **Visuals**: Use the neon/glow icon style for specific events (e.g., a glowing yellow card icon, a glowing rugby ball for a try).
- **Required Content**: Based on the legacy system, each timeline event card *must* be capable of displaying:
  - Match Time (e.g., `12:45`) and Period (e.g., `H1`).
  - Team Color indicator.
  - Event Label (e.g., `TRY`, `PENALTY`).
  - Specific Details (Reason, Outcome, Winner name).
  - Actor Name (Player who performed the action).
  - Score Snapshot (e.g., `12 — 5`).
  - *Scorer-specific actions* (Undo button, "Missing Details" prompts like `+ Player`, or `+ Conversion` follow-ups). **Note: These action prompts must only be visible to authenticated users with active scoring permissions, never to public viewers.**

### 3.4 Lineups (Team Rosters)
- **Layout**: Side-by-side columns (Home vs Away) or a toggleable view depending on screen width. 
- **Design Principles**: Use a very clean, structured grid. Avatar placeholders should use glassmorphism circles. Jersey numbers should be bold and prominent using the Inter font. Keep the visual weight light so it doesn't overwhelm the user.

### 3.5 Match Statistics
- **Layout**: Horizontal comparative bars (e.g., Possession: 60% vs 40%).
- **Design Principles**: Use the team's primary colors for the stat bars if available, falling back to our Electric Orange vs Electric Blue palette. The bars should feature subtle gradient fills or glowing caps to maintain the dynamic aesthetic. Data labels must be highly legible.

---

## 4. The Admin Scoring Interface

The `/admin/games/[id]/score` route is a crucial, high-stress interface used by officials actively watching a game. It prioritizes function, speed, and error prevention. For scoring and timing, the interface must be as clean and uncluttered as possible. Only the buttons and information strictly needed for scoring should be prominent on the page.

### 4.1 Interaction Design (Strava / Garmin Inspiration)
- **Massive Touch Targets**: Buttons must be large enough to tap accurately while moving or without looking closely.
- **Uncluttered Layout**: Remove all extraneous navigation, footers, or non-essential data from the screen. The focus is 100% on the clock, the score, and primary action buttons.
- **Stepped Event Capture**: Complex events (e.g., a Try + Conversion + Player Selection) should not require scrolling down a long form. Follow a **Stepped Approach**:
  1. Capture the primary event instantly (e.g., tap "Try"). The score updates immediately on WebSockets.
  2. Follow-up details (Reason, Player, Outcome) are presented in their own dedicated "pages" or full-screen modal steps to avoid vertical scrolling. 
  3. Details can be skipped and filled in later via the "Missing Details" prompts in the Event Feed if the official is in a rush.

### 4.2 Safety & Navigation Guards
- **High Friction Exits**: If an official attempts to swipe back, close the app, or tap a bottom navigation bar while a game is "Live" or has unsaved scores, a high-fidelity modal guard *must* explicitly require a deliberate action (e.g., "Hold to Exit" or a confirmation popup) to prevent accidental data loss.

---

## 5. The Admin Dashboard & Organization Management

Managing complex hierarchies (Users, Memberships, Organizations, Events) requires a clean, SaaS-like approach.

### 5.1 Scope Switching (Vercel / Stripe Inspiration)
- **Top-Level Context**: Use a clean dropdown menu in the top-left corner (or top of a mobile drawer drawer) to instantly switch between different "Organizations" or "Teams." 
- The UI should instantly pivot to reflect the context of the newly selected scope, reinforcing the multi-tenant architecture.

### 5.2 Creation Wizards
- For complex data entry (e.g., creating a new tournament or onboarding a new organization), use **multi-step wizards** instead of long, single-page scrolling forms. Break data validation into digestible chunks.

### 5.3 Data Submission UX (Auto-Save vs Explicit Save)
To prevent confusion, the app uses a hybrid data submission approach:
- **Instant/Auto-Save**: Used for all Live Scoring actions (WebSockets) and simple boolean toggles in settings.
- **Explicit Save/Cancel**: Used for complex forms (editing a roster, creating an event, changing organization details). These forms require a deliberate "Save" button click. 
- **Navigation Guards**: Whenever a user is in an Explicit Save view, any attempt to navigate away with unsaved changes must trigger a warning modal to prevent data loss.

---

## 6. Cross-Cutting UX Principles

### 6.1 Empty States & Offline Resilience
- **Empty States**: Never show a blank screen. If there are no games scheduled or a roster is empty, provide an illustrated empty state with a clear Call to Action (e.g., "No games today. Explore other leagues.") to keep the user engaged.
- **Offline Mode**: If the WebSocket drops, instantly display an **Offline Banner** anchored to the top of the screen (using a warning amber/yellow color) so users and officials know the data is no longer real-time.

### 6.2 Motion & Micro-interactions
- **Loading States**: Prefer **Skeleton Loaders** (shimmering dark blocks) over traditional spinning wheels for initial page loads to reduce perceived latency.
- **Page Transitions**: Use smooth horizontal slide transitions for deep navigation (e.g., drilling into a specific game from a feed) and vertical sheet modals for settings or forms.

### 6.3 Accessibility (a11y)
- **Touch Targets**: Regardless of visual size, the interactive hitbox for *any* clickable element (buttons, tabs, icons) must be a minimum of **44x44 pixels** to prevent mis-taps.
- **Contrast**: All components (both current and future) must maintain a sufficient contrast ratio across all of their constituent parts (text, icons, borders, active state indicators) to ensure every element is fully visible, readable, and distinguishable by users.
  - Informative text, labels, and functional icons must maintain a minimum WCAG AA contrast ratio of **4.5:1** (aiming for WCAG AAA **7:1+** for secondary actions and text links) in both Light and Dark themes.
  - Electric Blue (`#00E5FF`) must never be used as a text, fine border, or icon color directly over white or light-themed backgrounds; adaptive deep cyan or deep slate shades must be used instead.

### 6.4 Internationalization (i18n) Readiness
- **Architecture over Content**: The app is not required to launch with multiple languages. However, the *architecture* (e.g., `i18next` or `react-intl`) must be implemented from Day 1. 
- **No Hardcoded Strings**: Developers must never hardcode user-facing text in components (e.g., use `<Text>{t('buttons.save')}</Text>` instead of `<Text>Save</Text>`). Adding translations later is trivial; finding and replacing thousands of hardcoded strings later is a massive refactor.
