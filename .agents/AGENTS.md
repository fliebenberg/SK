# Real-Time State Synchronization Rules

## Client-Side Real-Time Updates & Server Broadcast Efficiency
- **Avoid Unnecessary Server Fetches**: Once a client component or page has subscribed to a real-time room/channel (e.g., via WebSockets/Socket.io), any data updates broadcasted by the server must be handled by **directly merging or setting the event payload data** into the local state.
- **Do Not Refetch**: Do not perform a backend query/refetch (`emit('get_data')` or HTTP GET) upon receiving a change notification event, unless a specific reconnection event or connection recovery occurs. This prevents massive server traffic floods when thousands of connected clients receive a broadcast event and attempt to refetch simultaneously.
- **Minimal Delta Payloads**: Initial room/page connections get full entity state (via initial `get_data`), but all subsequent real-time update broadcast events MUST send ONLY the minimal delta required to keep the client state up to date (e.g., sending `{ id, liveState: { clock } }` or `{ id, status }` rather than entire entity graphs).
- **Client-Side Delta Merging**: All client event listeners must support merging deltas into existing local state (e.g. shallow/deep merging updated fields into existing state objects or list items).

## Sending Socket Actions
- **Every action goes through `sendAction`** in [expo-app/services/actions.ts](file:///c:/Fred/Coding/SK/expo-app/services/actions.ts), never `wsService.emit('action', …)` — and on failure nothing may imply success. `npm run check:actions` enforces it. Full rule and the reply formats: [.agent/skills/action-replies/SKILL.md](file:///c:/Fred/Coding/SK/.agent/skills/action-replies/SKILL.md).

# Design, Layout, Styling & Colour

**The design docs are the only place for these rules** — this file used to carry its own copies, and
they drifted until several contradicted the design system (a `text-brand-orange` colour the colour
check now rejects, a row of edit/delete icons where the design system says one `⋯` menu). Read, and
follow:

- [okf/design_system.md](file:///c:/Fred/Coding/SK/okf/design_system.md) — colour tokens, components
  to reuse, read-first page rules, dialogs instead of `Alert.alert`, `useSafeBack` instead of
  `router.back()`, and the NativeWind constraints (what silently does nothing on a phone).
- [docs/design_spec.md](file:///c:/Fred/Coding/SK/docs/design_spec.md) — the visual language and
  navigation.

`npm run check:colors -- --strict` and `npm run check:styles` in `expo-app/` (both in the pre-commit
hook) enforce what can be checked mechanically.

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

# Repository Architecture Rules

## The App Is `expo-app/`; `client/` Was Removed
- **All Client Work Goes in `expo-app/`**: There used to be a root `client/` folder — an old Next.js, web-only version of the app. It was replaced by the multi-platform Expo app in `expo-app/` and deleted on 2026-09-13.
- **Highlight Remaining Relics, Do Not Remove Them**: If you find any remaining reference to `client/` or the old Next.js client — in code, config, docs, skills or `TODO.md` — point it out to the user so they can decide whether to delete it. Do not act on it, and do not remove it silently.
