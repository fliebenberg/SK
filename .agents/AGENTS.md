# Real-Time State Synchronization Rules

## Client-Side Real-Time Updates & Server Broadcast Efficiency
- **Avoid Unnecessary Server Fetches**: Once a client component or page has subscribed to a real-time room/channel (e.g., via WebSockets/Socket.io), any data updates broadcasted by the server must be handled by **directly merging or setting the event payload data** into the local state.
- **Do Not Refetch**: Do not perform a backend query/refetch (`emit('get_data')` or HTTP GET) upon receiving a change notification event, unless a specific reconnection event or connection recovery occurs. This prevents massive server traffic floods when thousands of connected clients receive a broadcast event and attempt to refetch simultaneously.
- **Minimal Delta Payloads**: Initial room/page connections get full entity state (via initial `get_data`), but all subsequent real-time update broadcast events MUST send ONLY the minimal delta required to keep the client state up to date (e.g., sending `{ id, liveState: { clock } }` or `{ id, status }` rather than entire entity graphs).
- **Client-Side Delta Merging**: All client event listeners must support merging deltas into existing local state (e.g. shallow/deep merging updated fields into existing state objects or list items).

## WebSocket Socket Action Emission Standard
- **Action Emission Contract**: All state mutation operations sent to the backend over Socket.io MUST be emitted using the event name `'action'`, with an object payload containing `type` (`SocketAction.ENUM_NAME`) and `payload`:
  ```typescript
  wsService.emit('action', { type: SocketAction.SAVE_GAME_ROSTER, payload: { gameId, participantId, items } }, (res: any) => { ... });
  ```
- **Never Pass Raw Action Enum as Event Name**: Do NOT emit socket events using `SocketAction.ENUM` directly as the event name (e.g., `wsService.emit(SocketAction.SAVE_GAME_ROSTER, ...)` is INVALID because the server only listens for `'action'`).
- **No `await` on `wsService.emit`**: `wsService.emit` accepts non-promise callbacks `(res: any) => void`. Do not `await wsService.emit(...)`.

# UI Notification & Dialog Rules

## Custom Modals and UI Alerts
- **Always Prefer Custom Overlay Modals**: Never use platform-native alert components like React Native's `Alert.alert` or default browser popups (`alert`, `confirm`) for confirmation prompts or actions. Always design and render custom, premium overlay modals (using `Modal` or inline styled layouts) for a consistent user experience.
- **Web Runtime Cross-Compatibility**: Because system default popups and native alert shims can fail silently or get blocked on web browsers, custom overlay modals must be used to ensure interactive delete/save workflows are fully functional across both mobile and web runtimes.

# Navigation & Routing Rules

## Safe Back Navigation
- **Always Use `useSafeBack`**: Never call `router.back()` directly for back buttons or back navigation handlers in Expo Router pages. Always import and use the `useSafeBack()` hook (e.g. `const safeBack = useSafeBack(); safeBack('/fallback/path')`) to provide a fallback URL. Calling `router.back()` directly causes unhandled navigation errors (`GO_BACK not handled`) when pages are opened via direct URL, deep link, page refresh, or view switchers without prior stack history.

# Card List UI/UX Layout Rules

## Consistent Card Layouts in Lists
- **Avoid Large Bottom Buttons**: Any card lists within the application (including organization administration panels, public views, and all future list implementations) must never use full-width action buttons at the bottom of the card.
- **Prefer Right-Aligned Compact Actions**: Actions must always be placed on the right side of the card to ensure consistency across the entire application. Use:
  - For admin cards: Small square icon buttons (e.g. `w-7 h-7` pencil/edit and trash buttons) in a horizontal row next to the metadata.
  - For public cards: A compact secondary button (e.g. `Roster` or `View` with `px-4 py-1.5` padding and shadow-sm) aligned on the right.
- **Universal Application**: This design pattern applies universally to all existing lists (e.g., teams, sites, facilities, leagues, seasons, divisions) as well as any new lists created in the future.

# React Native & NativeWind Styling Rules

## Avoid Tailwind Pseudo-Classes & CSS Transitions on Native Components
- **No Tailwind Pseudo-Classes on Interactive Components**: Never use pseudo-classes like `active:`, `hover:`, or `focus:` inside `className` strings on `TouchableOpacity`, `Pressable`, or `View` components (e.g. `active:opacity-80`, `active:scale-95`, `hover:border-...`). In NativeWind v4 (`react-native-css-interop`), these pseudo-classes trigger dynamic component upgrades at runtime that can cause dev warnings and navigation context serialization crashes during re-renders.
- **Use Native React Native Props**: Always use native React Native component props for press feedback (e.g., `activeOpacity={0.8}` on `<TouchableOpacity>`) or state-driven styling (`isActive ? 'bg-white' : ''`) instead of Tailwind pseudo-classes.
- **Avoid `transition-all` in Tailwind Classes**: Do not use `transition-all` or CSS transition utility classes on native views, as they mark components for runtime animated upgrade in NativeWind v4.

## Web-Only Tailwind Classes & Unsupported Utility Rules
- **No `truncate` on `<Text>`**: Never use `truncate` inside `className` strings on `<Text>` components. Truncation must always be handled using native React Native props (`numberOfLines={1}`).
- **No CSS Ring Utilities (`ring-*`, `ring-offset-*`)**: Do not use `ring-2`, `ring-4`, or ring color utilities. Use standard `border-2 border-brand-orange` or `border-4` instead.
- **No Web Alignment & Layout Classes (`mx-auto`, `my-auto`, `sticky`)**: Do not use `mx-auto` or `my-auto` on native views; use `self-center` (`alignSelf: 'center'`). Do not use `sticky` positioning on native views.
- **No Unsupported & Dynamic Shadow Utilities (`shadow-2xl`, `shadow-xs`, dynamic `shadow-*`)**: Only use standard supported React Native shadow tiers (`shadow-none`, `shadow-sm`, `shadow-md`, `shadow-lg`). Never put `shadow-*` classes inside dynamic ternary template literals (e.g. `${isActive ? 'shadow-sm' : ''}`) on native components (`TouchableOpacity`, `View`), as dynamic shadow class toggles force NativeWind to invoke `createAnimatedComponent` at runtime, causing navigation context crashes. Use static container styles or border/background state indicators instead.
- **No Web Percentage & Arbitrary Dimension Classes (`max-h-[80%]`, `w-[50%]`, `w-[48%]`, `max-w-[49%]`, `sm:max-w-[32%]`)**: Arbitrary dimension/percentage bounds in Tailwind class strings fail or collapse layouts in NativeWind v4 on mobile devices. Always use native React Native inline style objects (e.g. `style={{ width: '48%', maxWidth: '48%', maxHeight: '80%' }}`) for percentage or dynamic dimension constraints.
- **No CSS Sibling Spacing Utilities (`space-x-*`, `space-y-*`)**: Do not use `space-x-*` or `space-y-*` in `className` strings on native views. Tailwind relies on CSS sibling selectors (`> * + *`) for space utilities, which causes NativeWind v4 to trigger dynamic component upgrades at runtime and throw navigation context errors during re-renders. Use native Flexbox gap properties (`gap-2`, `gap-4`, `gap-6`, `gap-y-4`) instead.
- **Guard Web-Only DOM Props**: Never pass HTML5 web DOM props (`onDragOver`, `onDrop`, `onDragStart`, `draggable`) directly into native `<View>` or `<TouchableOpacity>` components without checking `Platform.OS === 'web'`. Passing unknown props to NativeWind components triggers interop upgrade warnings.

## ScrollView & Flexible Modal Container Layout Rules
- **Avoid Unconstrained Flex Children inside Flexible Max-Height Containers**: Never place a `<ScrollView>` with `flex: 1` inside a container that only specifies `maxHeight` without a concrete `minHeight` or `height`. In React Native's Yoga Layout Engine, `flex: 1` children inside an unconstrained-height container resolve to **height 0** on mobile devices (even though Web CSS browsers render them).
- **Mandatory `minHeight` & `contentContainerStyle` for ScrollViews**: Any `<ScrollView>` nested inside a flexible modal, dialog, or dynamic height panel MUST specify an explicit `minHeight` (e.g. `style={{ flex: 1, minHeight: 220, maxHeight: maxScrollHeight }}`) and include `contentContainerStyle={{ flexGrow: 1 }}`. The outer container must also specify a `minHeight` (e.g. `style={{ minHeight: 380, maxHeight: ... }}`).

# Centralized Styling & Color Rules

## Theme and Color Policy
- **No Hardcoded Hex Colors**: Hardcoded color strings (e.g., `#FF3E00`, `#94A3B8`, `#475569`) must never be used inline or in custom style configurations. All colors must be centralized.
- **Centralizing Inline Style Colors**: For inline styling objects (e.g., where React Native's `style` prop is necessary), import and use the central constants from [Colors.ts](file:///c:/Fred/Coding/SK/expo-app/constants/Colors.ts) via the `COLORS` object or the `getThemeColor` utility function.
- **Centralizing Utility Class Colors (Tailwind)**: For utility-class based styles (Tailwind/NativeWind `className` strings), always extend the theme variables inside [tailwind.config.js](file:///c:/Fred/Coding/SK/expo-app/tailwind.config.js) under the `extend.colors` block. Use these semantic variables (e.g., `text-brand-orange`, `text-textSecondary`, `bg-surface`) instead of arbitrary colors.
- **Theme-Awareness**: Ensure all labels and texts adapt correctly to light/dark themes by referencing the centralized light/dark palettes rather than styling for a single mode.

# Database Schema & Migration Rules

## Schema Isolation & Migration Discipline
- **No Inline DDL in Application Code**: Data access objects, managers, and API route/socket handlers must NEVER execute inline DDL or schema alterations (e.g., `ALTER TABLE`, `CREATE TABLE`, `DROP COLUMN`) or auto-migration try-catches. Application code must strictly query and mutate data based on expected schemas.
- **Explicit Migration Process Only**: All database schema changes (adding/modifying tables, columns, indexes, constraints) MUST be implemented exclusively through dedicated, versioned migration scripts inside `server/src/scripts/migrations/` (or `init-db.ts` for fresh database initialization).
- **Mandatory Synchronization with `init-db.ts`**: Whenever creating a new database migration that alters database structure, the developer or AI agent MUST ALSO update [`server/src/scripts/setup/init-db.ts`](file:///c:/Fred/Coding/SK/server/src/scripts/setup/init-db.ts) so fresh database deployments immediately reflect the latest schema.
- **Inspect Live Database Schema Directly**: AI agents and developers must query the actual PostgreSQL database schema (e.g. querying `information_schema.columns` or database metadata) when inspecting table structure, column names, and data types, rather than relying solely on older TypeScript interfaces or table creation scripts.

## Strict Data Preservation Policy
- **Zero Data Loss Rule**: Migration scripts and database operations must NEVER drop tables, drop columns, truncate data, or delete existing records unless explicitly requested and approved by the user.
- **Backwards-Compatible Schema Changes**: Always use safe, non-destructive migration statements (e.g., `ADD COLUMN IF NOT EXISTS ... DEFAULT NULL`) to preserve all existing data intact across deployments.

# Error Handling & Strict Fallback Policy Rules

## No Silent Fallbacks on Missing Required Data
- **Avoid Silent Fallbacks**: Never implement hardcoded fallback strings, dummy values, or silent defaults (e.g. `sportId || 'rugby'`, returning empty state or default entities silently) when expected configuration, entity IDs, or required variables are missing.
- **Surface Errors Explicitly**: If required dynamic variables or data schemas are missing or not found, throw an explicit, descriptive error or surface a visible alert in the application to indicate that something unexpected occurred.

# Repository Architecture & Read-Only Directories

## Deprecated Client Directory Rule
- **`client/` Folder is Read-Only**: The `client/` directory contains legacy Web-only code and is strictly deprecated. Never edit, modify, or create files inside `client/`. All mobile and web frontend changes must be made exclusively in `expo-app/`.




