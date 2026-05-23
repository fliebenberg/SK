# Create Expo ScoreKeeper App (V2)

The goal is to build the second version of the ScoreKeeper client using Expo, React Native, and TypeScript. This cross-platform application will replace the existing Next.js `client` and provide a premium, dark-mode-first aesthetic. It relies on a "Light & Fast" architecture, heavily utilizing WebSockets for real-time live score updates and employing a modular UI registry for supporting multiple sports. All implementation and design decisions are derived strictly from `docs/client_functional_spec.md` and `docs/design_spec.md`.

## Design Decisions & Pending Reviews
> [!IMPORTANT]
> Please review and approve the following recommendations before we proceed:
> 
> **1. Styling Strategy Recommendation**
> - **Option A: NativeWind** (Tailwind for React Native)
>   - *Pros*: Familiar utility-class syntax, extremely fast to prototype, shares mental model with web Tailwind, automatically handles responsive design well.
>   - *Cons*: Can occasionally struggle with complex, highly dynamic custom animations or very specific native quirks; slight overhead during compilation.
> - **Option B: React Native StyleSheet + Reanimated**
>   - *Pros*: Maximum performance, total control over native views, zero translation overhead, handles complex gesture-driven animations beautifully.
>   - *Cons*: Slower to write, requires maintaining a custom theme context, no utility classes.
> - **Recommendation**: **NativeWind**. Given the functional spec emphasizes a variable-driven Tailwind approach and rapid development for cross-platform, NativeWind provides the best balance of speed and maintainability.
> 
> **2. State Management Recommendation**
> - **Option A: Zustand**
>   - *Pros*: Tiny footprint, avoids React Context re-rendering hell, extremely simple API, easy to integrate with WebSockets outside of React components.
>   - *Cons*: Adds a minor third-party dependency.
> - **Option B: Custom React Context + Refs**
>   - *Pros*: Zero dependencies, complete control over memory allocation.
>   - *Cons*: Difficult to optimize without causing unnecessary re-renders; accessing state outside of React components (like inside a background WebSocket service) is cumbersome.
> - **Recommendation**: **Zustand**. It perfectly matches the requirement for an "aggressively small memory footprint" while cleanly separating state from the UI, which is critical for the WebSocket service that runs outside of React component lifecycles.
> 
> **3. Authentication (Standard JWT)**
> - We will use Standard JWT with Expo `SecureStore`. To support social logins across both Web and Mobile seamlessly, we will utilize Expo's `AuthSession` and `WebBrowser` modules to handle the OAuth redirects securely on all platforms.

## Proposed Implementation Phases

### Phase 1: Foundation & Setup
- Initialize the Expo app with TypeScript (`npx create-expo-app@latest expo-app -t expo-template-blank-typescript`).
- Configure Expo Router for file-based navigation.
- Set up path aliases (e.g., `@/*`), link the existing `@sk/types` from the `shared` directory, and configure the default page-not-found route via Expo Router (`+not-found.tsx`).
- Establish the theme provider for the variable-driven design system (Dark mode first, Electric Orange/Electric Blue accents).
- Load custom fonts (`Orbitron` for numbers/headers, `Inter` for body).
- Implement the baseline WebSocket service for connecting to the existing `server`.

### Phase 2: Design System & Core Components
- Build the core UI tokens (colors, typography, grid/spacing based on the 8-point system) strictly based on `docs/design_spec.md`.
- Implement foundational components utilizing glassmorphism and the dark-mode aesthetic:
  - Primary and secondary Buttons (using Electric Orange and Electric Blue accents).
  - Base Card components featuring translucent backgrounds (`rgba(255, 255, 255, 0.05)` with blur) and 16px/24px padding.
  - Typography components (headers/numbers using Orbitron, body/labels using Inter).
- Build the Hybrid Navigation System:
  - Mobile: Bottom Tab Bar (Viewer) / Hamburger Drawer (Admin).
  - Desktop: Left Navigation Rail (Viewer) / Persistent Pinned Sidebar (Admin).
- Implement global UI states: Skeleton Loaders, Empty States, and the Offline Banner.

### Phase 3: Initial Public & Auth Foundation
- Implement the General Landing Page (`/`) as a basic placeholder scaffold (detailed implementation will be tackled separately).
- Implement Authentication screens and JWT handling with `SecureStore` (including social login OAuth flows using Expo AuthSession).

### Phase 4: Admin & Scoring Workflow
- Build the Admin Dashboard (`/admin/*`) with Context Switcher for multi-tenant organizations.
- Implement the high-performance Scoring Interface (`/admin/games/[id]/score`):
  - Massive touch targets and uncluttered UI.
  - Client-side Game Clock engine.
  - Stepped event capture flow (e.g., Action -> Details).
  - Implement high-friction navigation guards to prevent accidental exit during a live game.
- Implement Creation Wizards for Organizations/Events with Explicit Save and validation.

### Phase 5: Advanced Architecture & Refinement
- Implement the "Modular Sport UI Registry" to dynamically load scoring panels based on sport type.
- Implement the deduplication and Consensus Undo mechanism logic for match events.
- Ensure Timezone Awareness for all scheduled fixtures.
- Set up internationalization (`i18next`) architecture.

### Phase 6: Public Viewer Experience
- Build the Live Feed (`/live`) with real-time WebSocket subscription integration.
- Create the Match Details view (`/games/[id]`):
  - Compact Match Scoreboard with pulsing "LIVE" indicator and "Blink" animations on score change.
  - Tabbed interface (Overview, Play-by-Play, Lineups, Stats) using glassmorphism.
  - Vertical Timeline for play-by-play events.
  - Lineups and Match Statistics comparative bars.
- Build Organization, Team, and Site directory/profile pages.

## Verification Plan

### Automated Tests
- Run TypeScript type checks across the new Expo project to ensure compatibility with `@sk/types`.
- Add unit tests for the Game Clock engine and Dynamic Scoring Engine.

### Manual Verification
- **Aesthetic Check**: Verify that the dark mode aesthetic, Orbitron fonts, and glassmorphism match the design spec exactly.
- **Responsiveness**: Run the app on both a mobile simulator (iOS/Android) and a desktop web browser to verify the Hybrid Navigation switches correctly (Bottom Tabs vs Left Rail).
- **Real-time Sync**: Open the scoring interface in one window and the viewer interface in another to verify sub-second score updates via WebSockets, including the "Blink" animation.
- **Offline Behavior**: Disconnect the network and ensure the Offline Banner appears immediately.
