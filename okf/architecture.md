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
*   **[shared/](file:///c:/Fred/Coding/SK/shared/)**: Shares interfaces, constants, and utilities between the frontend and backend.
    - Path: [shared/src/types/](file:///c:/Fred/Coding/SK/shared/src/types/) houses the shared TypeScript models (`@sk/types`).
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
