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
    - **`shared/` is the only package with a test framework.** `npm test` there runs Vitest over `src/**/*.test.ts` (added 2026-09-01, tournaments Phase 2). It is a plain TypeScript package — no React Native, no sockets, no database — so the whole setup is one dev dependency and [vitest.config.mts](file:///c:/Fred/Coding/SK/shared/vitest.config.mts), and the highest-risk pure logic in the app lives here. `server/` and `expo-app/` still verify with `ts-node` scripts and named manual checks; a `server/` harness waits on a disposable test database.
*   **[docs/](file:///c:/Fred/Coding/SK/docs/)**: Canonical specifications and documentation.
*   **[client/](file:///c:/Fred/Coding/SK/client/)** (DEPRECATED): Contains an older, web-only version of the application. **This directory must not be edited or changed under any circumstances.**

## Critical Architectural Rules

1. **Deprecated client/ Folder**:
   - **DO NOT MODIFY** any files under the `client/` directory. No edits, additions, or deletions are allowed there. It is strictly for reference purposes.
   - All new client-side features must be written inside the `expo-app/` directory.
   - Refer to [.clinerules](file:///c:/Fred/Coding/SK/.clinerules) for more details.
2. **Native Reanimated Restrictions**:
   - To prevent native JSI runtime bridge crashes on Android and iOS devices, **DO NOT** install or use `react-native-reanimated` or `react-native-worklets-core`.
   - Custom transitions must use standard React Native `Animated` utilities or stylesheet animations instead of Reanimated or NativeWind transition classes.
3. **UI Dialogue & Alerts Boundary**:
   - **DO NOT** use default native popups (like React Native's `Alert.alert` or standard browser popup dialogs) for warnings or delete confirm actions.
   - Use custom overlay layouts/modals to ensure consistent styling and prevent silent browser intercept blocks.
