# ScoreKeeper Client - Functional Specification

## 1. Overview & Core Concepts
ScoreKeeper is a cross-platform application designed to manage sports organizations, teams, and events, while simultaneously providing a live viewer experience for fans. 

**Backend Integration**: The AI agent implementing this client will need to interface with the existing backend. The backend code (REST API, WebSockets, Database) is located in the `server` directory at the project root. Shared Data Models are located in the `shared` directory.

**Core Domains:**
*   **Management (Admin)**: Allows organization owners/staff to create events, schedule games, manage rosters, and record live scores.
*   **Viewer Experience**: Allows users to follow live games, view schedules, see match results, and track statistics.
*   **Real-time Synchronization**: The app heavily utilizes WebSockets to instantly broadcast score changes and game events to all viewers.

## 2. Guiding Principles
*   **Cross-Platform & Responsive**: The app will be built using Expo with TypeScript and React Native to share a single codebase across Web, iOS, and Android. The UI must be completely responsive, adapting seamlessly to both mobile devices and large desktop screens.
*   **Performance & Responsiveness ("Light & Fast")**: The application prioritizes minimal data transfer and a small memory footprint. The Global Store should maintain only necessary data and clear data when it is no longer needed. The interface must remain highly responsive at all times.
*   **WebSocket-First Data Exchange**: Since the app already utilizes WebSockets, this is the preferred method for exchanging data between the device and the server. REST API calls should only be used when there is a clear advantage or necessity over WebSockets.
*   **High Modularity**: Core functionality is designed to be highly reusable across different sports, organizational types, and team structures. Features should not be hardcoded to a specific sport unless strictly necessary.
*   **Code Documentation & Clarity**: Maintain excellent documentation as part of the codebase. Code should be clean, self-explanatory where possible, and properly commented to make understanding the logic and the reasoning behind architectural decisions clear for all developers.

## 3. Glossary
To ensure a common understanding across the specification and future development, the following terms are defined:
*   **User (App-Wide)**: An individual with a registered account on the ScoreKeeper platform. This is the global entity used for authentication and tracking personal preferences.
*   **Member (OrgProfile)**: An organization-specific persona. A single App-Wide User can hold multiple different Memberships across various Organizations.
*   **Role**: A specific permission level (e.g., Coach, Manager, Scorekeeper). **Crucially, Roles are allocated to a Membership**, not directly to the global User. A person might be an Admin in one organization and just a Player in another.
*   **Organization**: Any entity that manages events or teams. This can range from a large sports league or school down to a local pub organizing a weekly darts league.
*   **Event**: A container for multiple games, such as a tournament, a season, or a specific league cup.
*   **Game**: A single fixture between participants. We standardize on the term **"Game"** rather than "Match" to align with the codebase. Participants in a Game can be teams or individuals depending on the sport.
*   **Site**: The overall physical, geographical location or address (e.g., "Central Sports Complex", "High School Campus").
*   **Facility**: A specific demarcated playing area situated *within* a Site (e.g., "Tennis Court 1", "Main Rugby Field", "Dartboard 3").

## 4. Authentication & Authorization
*   **Authentication Mechanism**: Standard JWT/Session-based authentication designed to be compatible with both Web and Mobile (iOS/Android) deployments. 
*   **Authorization Levels**:
    *   **Public (Unauthenticated)**: Can view the general landing page, search public organizations/teams, and follow live games.
    *   **Authenticated User**: Can personalize their feed, follow specific teams/sports, and manage their own profile. 
    *   **Organization/Team Member**: Granted specific roles which dictate permissions via their Membership links. Common roles include:
        *   *Owner / Admin*: Full control over the entity.
        *   *Manager*: Can schedule games and edit rosters.
        *   *Scorekeeper / Official*: Granted specific rights to update the live score of a game.
        *   *Coach*: Can view restricted team details and manage players.
        *   *Player*: Can view schedule and team-specific comms.
    *   **Global Admin** (`globalRole === 'admin'`): Has unrestricted access to the entire platform.

## 5. Data Models & Entities
The client shares core data models with the backend (located in `@sk/types` inside the `shared` directory). Key entities include:
*   **Organization**: Represents a club, school, league, or any organizing entity.
*   **Team**: A group of players participating in a specific sport. *Note: Even in sports where individuals compete head-to-head, players can be grouped into a Team to compete collectively.*
*   **Site / Facility**: Venues where games are played.
*   **Event**: A tournament, league, or season containing multiple games.
*   **Game**: A single fixture. Contains `liveState` (current score/time) and `status` (Scheduled, Live, Finished).
*   **Sport**: A specific ruleset and configuration (e.g., "Rugby Union", "Chess").
*   **User**: The global application user.
*   **OrgMembership / TeamMembership**: The bridge entities that handle memberships. An `OrgMembership` links a User's Profile to an Organization, storing their specific `OrganizationRole` and membership duration. A `TeamMembership` links a User's Profile to a Team with a `TeamRole`.

## 6. Global Services, State Management, and Core Logic
*   **Global Store**: A custom reactive store that holds fetched data and authentication state. 
    *   *Memory Management*: The store must maintain an aggressively small memory footprint, holding only data currently needed by active components and clearing it when no longer needed.
*   **WebSocket Service**: Maintains a persistent connection to the backend.
    *   *Smart Subscription Management*: Components register specific data feeds via reference counting. The service subscribes when the count is > 0 and automatically sends an unsubscribe message to the server when the count hits 0.
    *   *Offline Resilience*: The service actively monitors connection status and provides clear visual indicators (e.g., an Offline Banner) to the user if the live feed drops.
*   **API Interaction (REST Fallback)**: REST API calls must be explicitly justified, as WebSockets are preferred. Typical use cases:
    *   Authentication payloads (login/signup)
    *   Heavy binary uploads (images, logos, avatars)
*   **Game Clock Engine**: The client handles real-time game clocks (start, stop, half-time logic) decoupled from constant server round-trips to save bandwidth and ensure smooth UI updates.
*   **Dynamic Scoring Engine**: The complex logic for interpreting scoring events (e.g., calculating points for a Try vs Penalty) is handled client-side before sending the final summarized payload to the server.
*   **Media Processing**: The client supports client-side image cropping and basic optimization before uploading binary data to the backend.

## 7. Routing Map & Page Specifications

### 7.1 Public & Viewer Routes
*   `/` (General Landing Page): Aimed primarily at unauthenticated users. Contains clear calls to action and showcases the app's features to drive registrations.
*   `/live`: Central hub to view all currently active games. Serves as the primary landing page for **authenticated logged-in users**, displaying a personalized feed based on followed teams/orgs.
*   `/games/[id]`: Detailed view of a specific game. Displays the live score, time, participants, and events.
*   `/organizations/[id]`: Public viewer page for an organization, showing its teams, public events, and public contact info.
*   `/teams`: Directory of public teams.
*   `/teams/[id]`: Public Team profile showing recent results, upcoming schedule, and public roster.
*   `/sites`: Directory of game venues (Sites).
*   `/sites/[id]`: Detailed view of a specific Site, displaying its address, contact info, and a list of all Facilities located there.
*   `/profile`: User profile management (preferences, linked accounts).
*   `/notifications`: In-app notification center.

### 7.2 Administration Routes (`/admin/*`)
*   *Note: Critical admin forms (e.g., editing rosters or settings) must utilize **Navigation Guards** to warn users and prevent accidental data loss if they attempt to navigate away with unsaved changes.*
*   `/admin`: Main management dashboard.
*   `/admin/claim`: Workflow for a user to claim ownership of an existing, pre-populated organization. Includes sub-routes `/claim/decline` & `/claim/refer`.
*   `/admin/organizations`: List of organizations the user manages.
*   `/admin/organizations/new`: Wizard to create a new organization.
*   `/admin/organizations/[id]`: Organization dashboard.
*   `/admin/organizations/[id]/events`: Management of tournaments/leagues for the org.
*   `/admin/organizations/[id]/teams`: Management of teams within the org.
*   `/admin/organizations/[id]/people`: Roster and staff management.
*   `/admin/organizations/[id]/sites`: Venue management.
*   `/admin/games/[id]`: Interface for editing game-specific details (e.g., start time, venue, rules).
*   `/admin/games/[id]/score`: **Crucial Feature** - The active scoring interface used by officials to update the `liveState` of an ongoing game.
*   `/admin/reports`: Admin reporting.
*   `/admin/settings`: Global admin settings.
*   `/admin/users`: Global user management.

## 8. Additional Technical Requirements (Cross-Cutting)
*   **Modular Sport UI Registry**: The UI must implement a registry pattern that dynamically loads sport-specific scoring panels and dashboard modules depending on the `Sport` of the active game (e.g., loading a Rugby scoreboard vs. a Tennis scoreboard).
*   **Timezone Awareness**: The application must natively handle converting UTC timestamps provided by the server into the user's local timezone for all scheduled fixtures and historical feeds.
*   **Theming Engine**: The app must support a robust theming system (e.g., Light Mode, Dark Mode) to allow for user customization and improved accessibility.

## 9. Planned Changes from Current Implementation
To successfully migrate from the current web-only Next.js application to the cross-platform Expo application, the following major changes must be implemented:
*   **Data Model Refactoring**: The `SportCategory` data model will be completely removed from the backend and shared types, as the application logic relies solely on the `Sport` name to derive modular UI components.
*   **Authentication System Overhaul**: The current `next-auth` implementation will be replaced with an Expo-compatible authentication solution that works seamlessly across Web, iOS, and Android (e.g., standard JWT with SecureStore, Firebase Auth, or Supabase Auth).
