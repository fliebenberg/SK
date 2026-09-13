---
type: concept
title: Codebase Architecture
description: Codebase layout, folder responsibilities, and architectural boundaries.
tags:
  - concept
  - architecture
  - codebase-map
timestamp: 2026-07-02T14:56:00Z
---

# Codebase Architecture

The ScoreKeeper project is organized as a multi-platform monorepo with clear separation between client, server, and shared interfaces.

For details on the extensible multi-sport architecture, see [multi_sport_architecture.md](file:///c:/Fred/Coding/SK/docs/multi_sport_architecture.md).

## Directory Structure

*   **[expo-app/](file:///c:/Fred/Coding/SK/expo-app/)**: The active client application built with Expo (React Native). It is responsive (mobile bottom tabs, desktop left rail navigation) and compiles to iOS, Android, and Web viewports.
*   **[server/](file:///c:/Fred/Coding/SK/server/)**: The backend server built with Node.js, Express, PostgreSQL, and WebSockets.
*   **[shared/](file:///c:/Fred/Coding/SK/shared/)**: Shares interfaces, constants, and utilities between the frontend and backend. Published as the `@sk/shared` package — renamed from `@sk/types` on 2026-08-15 once the folder outgrew holding only types. The deprecated `client/` was deliberately left on the old `@sk/types` name; everything live imports from `@sk/shared`.
    - [shared/src/models/](file:///c:/Fred/Coding/SK/shared/src/models/): the shared TypeScript models, including [Tournament.ts](file:///c:/Fred/Coding/SK/shared/src/models/event/Tournament.ts) — divisions, stages, entrants, the `ScoringSystem` that leagues and tournaments share, and the fill rules that stand in for an unknown competitor.
    - [shared/src/utils/](file:///c:/Fred/Coding/SK/shared/src/utils/): shared logic used by both sides, e.g. [templateSteps.ts](file:///c:/Fred/Coding/SK/shared/src/utils/templateSteps.ts) for reading a sport's event templates, [standings.ts](file:///c:/Fred/Coding/SK/shared/src/utils/standings.ts) for the one standings answer, and [fixtureSide.ts](file:///c:/Fred/Coding/SK/shared/src/utils/fixtureSide.ts) for what prints on a side of a fixture.
    - [shared/src/constants/](file:///c:/Fred/Coding/SK/shared/src/constants/): socket actions, undo-window rules.
    - **What may go in `shared/`: code that is genuinely used by *both* the server and the app.** That is the whole test, and it is a gate rather than a description — "it feels reusable" or "another screen might want it" is not a reason to put something here. Code used by one side belongs to that side: shared logic the server never runs is a dependency the server carries and a boundary that stops meaning anything. Two consequences worth stating, because both have nearly gone wrong. **Nothing viewer-dependent may live here** — anything reading the ambient locale, timezone or "now" gives a different answer on the server than in the browser, so a server importing it renders the *server's* idea of the time to a user somewhere else; if such a thing ever must be shared, it takes an explicit timezone rather than reading the ambient one. And **a formatter shared for consistency is shared because two runtimes must agree on the wording**, which is exactly why [fixtureSide.ts](file:///c:/Fred/Coding/SK/shared/src/utils/fixtureSide.ts) is here (the server and print paths must say what the screen says) and why [expo-app/utils/dates.ts](file:///c:/Fred/Coding/SK/expo-app/utils/dates.ts) is deliberately **not** (U49 — the server renders no dates for humans). App-only shared code goes in [expo-app/utils/](file:///c:/Fred/Coding/SK/expo-app/utils/); server-only in `server/src/`.
    - **`shared/` is the only package with a test framework.** `npm test` there runs Vitest over `src/**/*.test.ts` (added 2026-09-01, tournaments Phase 2). It is a plain TypeScript package — no React Native, no sockets, no database — so the whole setup is one dev dependency and [vitest.config.mts](file:///c:/Fred/Coding/SK/shared/vitest.config.mts), and the highest-risk pure logic in the app lives here. `server/` and `expo-app/` still verify with `ts-node` scripts and named manual checks; a `server/` harness waits on a disposable test database.
*   **[docs/](file:///c:/Fred/Coding/SK/docs/)**: Canonical specifications and documentation.
*   **[client/](file:///c:/Fred/Coding/SK/client/)** (DEPRECATED): Contains an older, web-only version of the application. **This directory must not be edited or changed under any circumstances.**

## Critical Architectural Rules

1. **Deprecated client/ Folder**:
   - **DO NOT MODIFY** any files under the `client/` directory. No edits, additions, or deletions are allowed there. It is strictly for reference purposes.
   - All new client-side features must be written inside the `expo-app/` directory.
   - Refer to [.clinerules](file:///c:/Fred/Coding/SK/.clinerules) for more details.
2. **Reanimated & the Worklets Stack**:
   - **The incident.** On 2026-06-09 (`f87a18c`) the app was crashing on Android and iOS with an **`installTurboModule` argument count mismatch** — a native JSI/TurboModule signature clash caused by a version-mismatched worklets stack. `expo-app` was carrying `react-native-reanimated@4.2.1` **and** `react-native-worklets-core@^1.6.3` as direct dependencies, plus `'react-native-reanimated/plugin'` in [babel.config.js](file:///c:/Fred/Coding/SK/expo-app/babel.config.js). Dropping all three fixed it, and it has not recurred.
   - **Still binding.** Do **not** add `react-native-reanimated` or `react-native-worklets-core` to `expo-app`'s dependencies, and do **not** put `'react-native-reanimated/plugin'` back into `babel.config.js`.
   - **Do not author animations with Reanimated**, and do not use NativeWind animation/transition utility classes (`transition-all`, `transition-colors`, …) — they make NativeWind look for Reanimated at runtime. Animate with React Native's `Animated`, through [`<AnimatedBox>`](file:///c:/Fred/Coding/SK/expo-app/components/AnimatedBox.tsx); [design_system.md](file:///c:/Fred/Coding/SK/okf/design_system.md) has the how and why.
   - **Two things this rule does *not* forbid**, despite its earlier wording. `react-native-worklets@0.7.3` is a **required direct dependency** — re-added 2026-06-16 (`157323b`) to fix Android map rendering, with no recurrence since; it is a different package from `react-native-worklets-core`. And `react-native-reanimated@4.2.1` **is installed**, transitively via `expo-router@55` and via `nativewind` → `react-native-css-interop`, with [_layout.tsx](file:///c:/Fred/Coding/SK/expo-app/app/_layout.tsx) calling `configureReanimatedLogger` at startup — it cannot be removed without dropping expo-router. Its *presence* was never the failure mode; the mismatched direct-dependency stack was. Note that `react-native-css-interop` reaches Reanimated on its own on native (see `UI-7`), which is one more reason to keep our own animations on RN `Animated`.
   - *Corrected 2026-09-09 (`UI-8`).* The rule previously read "**DO NOT** install or use `react-native-reanimated` or `react-native-worklets-core`", which was false as written and recorded no reason; the `installTurboModule` detail above was recovered from [.clinerules](file:///c:/Fred/Coding/SK/.clinerules) as written in `f87a18c`.
3. **UI Dialogue & Alerts Boundary**:
   - **DO NOT** use default native popups (like React Native's `Alert.alert` or standard browser popup dialogs) for warnings or delete confirm actions.
   - Use custom overlay layouts/modals to ensure consistent styling and prevent silent browser intercept blocks.
