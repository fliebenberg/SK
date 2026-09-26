---
type: concept
title: Codebase Architecture
description: The three packages, what each is responsible for, and the architectural rules that bind them.
tags:
  - concept
  - architecture
  - codebase-map
timestamp: 2026-09-26T00:00:00Z
---

# Codebase Architecture

ScoreKeeper is a monorepo of three packages. The multi-sport design they implement is in [multi_sport_architecture.md](file:///c:/Fred/Coding/SK/docs/multi_sport_architecture.md).

- **[expo-app/](file:///c:/Fred/Coding/SK/expo-app/)**: the app, on every platform. Expo (React Native), compiled to iOS, Android and web; responsive (bottom tabs on a phone, left rail on a desktop).
- **[server/](file:///c:/Fred/Coding/SK/server/)**: the backend. Node.js, Express, PostgreSQL and WebSockets.
- **[shared/](file:///c:/Fred/Coding/SK/shared/)**: what the other two must agree on. Models, socket-action constants and logic both sides run, published as `@sk/shared`. Browse [shared/src/](file:///c:/Fred/Coding/SK/shared/src/) for what is there.
- **[docs/](file:///c:/Fred/Coding/SK/docs/)**: canonical specifications. Not a package.

A fourth package, `client/` (an older Next.js web-only app that `expo-app/` replaced), was deleted on 2026-09-13. To-do entries that mention it are closed records, kept as history in [TODO-archive.md](file:///c:/Fred/Coding/SK/TODO-archive.md).

## Rules

### What may go in `shared/`

1. **Only code that both the server and the app actually use.** This is a gate. "It feels reusable" or "another screen might want it" is not a reason. Code used by one side belongs to that side: app-only in [expo-app/utils/](file:///c:/Fred/Coding/SK/expo-app/utils/), server-only in `server/src/`. *Why:* shared code the server never runs is a dependency it carries for nothing, and the boundary stops meaning anything.
2. **Nothing viewer-dependent.** Code that reads the ambient locale, timezone or "now" gives the server a different answer from the browser, so a server importing it renders *its* time to a user somewhere else. If such code must ever be shared, it takes the timezone as a parameter. This is why [expo-app/utils/dates.ts](file:///c:/Fred/Coding/SK/expo-app/utils/dates.ts) is not in `shared/` (the server renders no dates for humans), while the deterministic calendar-date parts both sides need are in [calendarDate.ts](file:///c:/Fred/Coding/SK/shared/src/utils/calendarDate.ts); see the [date-formatting skill](file:///c:/Fred/Coding/SK/.agent/skills/date-formatting/SKILL.md).
3. **A formatter is shared only when two runtimes must print the same words.** [fixtureSide.ts](file:///c:/Fred/Coding/SK/shared/src/utils/fixtureSide.ts) qualifies: the server and print paths must say what the screen says.

### Testing

4. **Put high-risk pure logic in `shared/`, where it can be unit tested.** `shared/` is the only package with a test framework: Vitest over `src/**/*.test.ts` via `npm test` ([vitest.config.mts](file:///c:/Fred/Coding/SK/shared/vitest.config.mts)). It has no React Native, sockets or database, so the setup is one dev dependency. `server/` and `expo-app/` are still checked with `ts-node` scripts and manual checks. A `server/` harness is waiting on a disposable test database.

### Reanimated and the worklets stack

5. **Do not add `react-native-reanimated` or `react-native-worklets-core` as direct dependencies of `expo-app`, and do not put `'react-native-reanimated/plugin'` back in [babel.config.js](file:///c:/Fred/Coding/SK/expo-app/babel.config.js).** *Why:* that stack caused an `installTurboModule` argument-count crash on Android and iOS (fixed in `f87a18c`, 2026-06-09).
6. **Animate with React Native's `Animated`, through [`<AnimatedBox>`](file:///c:/Fred/Coding/SK/expo-app/components/AnimatedBox.tsx). Never author animations with Reanimated, and never use NativeWind `transition-*` classes**, which make NativeWind reach for Reanimated at runtime. The how is in [design_system.md](file:///c:/Fred/Coding/SK/okf/design_system.md).
7. **Rule 5 does not forbid these:** `react-native-worklets` is a **required** direct dependency (for Android map rendering; `157323b`), and is a different package from `react-native-worklets-core`. `react-native-reanimated` **is** installed, transitively through `expo-router` and `nativewind`, and cannot be removed without dropping expo-router. The mismatched direct-dependency stack was the failure, not Reanimated being installed.

The full incident and how this rule was corrected are in `UI-8` ([TODO-archive.md](file:///c:/Fred/Coding/SK/TODO-archive.md)).

### Dialogs

8. **Do not use native popups** (`Alert.alert`, browser `confirm`/`alert`) for warnings or delete confirmations. Use the app's own modals, for consistent styling and because browsers can silently block native popups.
