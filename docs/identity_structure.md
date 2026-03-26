# Identity Architecture

The SportKeeper application utilizes a dual-layered identity architecture to manage users and their various personas within different organizations. This separation ensures strict data scoping, robust privacy, and the flexibility for an individual to have different details associated with different roles.

## 1. Global Users (`users` table)
At the highest level is the **User**. This represents the real-world human being who authenticates with the application.

*   **Authentication & Access:** The `users` table is responsible for login credentials (handled via NextAuth/Supabase), global application preferences, and overarching system roles (e.g., Super Admins).
*   **One-to-Many:** A single User can represent multiple distinct entities across the platform (e.g., a teacher at one school, a parent at another, and a referee in an independent league).
*   **Fields:** Includes global profile picture, primary email, display name, etc.

## 2. Organization Personas (`org_profiles` table)
Below the global User is the **Organization Profile** (`org_profile`). This is the core record for assigning roles, tracking memberships, and displaying directory information within a specific organization.

*   **Organization Scoped:** Every `org_profile` is strictly tied to an `organization_id`. It represents "who this person is" *in the context of this specific org*.
*   **Linking to Users:** An `org_profile` can (and ideally should) be linked to a global `user_id`. When linked, the global User gains access to the permissions and roles associated with that `org_profile`.
*   **Unlinked Profiles:** It is common for `org_profiles` to exist without a linked `user_id` (e.g., a school creates profiles for all students, but the students haven't logged into the app yet).
*   **Persona Isolation:** Because an individual has separate `org_profiles` in different organizations, they can maintain distinct data for each:
    *   **Images:** A person might have a formal headshot for their teaching `org_profile` and a casual picture for their global `user` profile or a different club's `org_profile`.
    *   **Identifiers:** A student's ID number `identifier` is stored directly on their school's `org_profile`.
*   **UI Cache:** The table includes `primary_role_id` to quickly cache and display their main organization-level role.

## 3. Memberships & Roles
Specific relationships and permissions are attached to the `org_profile`, not directly to the global `user`.

*   **`org_memberships`:** Links an `org_profile` to specific overarching organization roles (e.g., "Org Admin", "Member"). An individual might have multiple entries here if they hold multiple distinct administrative roles.
*   **`team_memberships`:** Links an `org_profile` to a specific team with a specific role (e.g., "Coach", "Assistant Coach", "Player", "Manager"). It tracks the `startDate` and `endDate` of when that persona was active on the team.

*Note: The system supports individuals holding multiple concurrent roles (e.g., returning as both a Coach for one team and a Player on another).*

## 4. Handling External Entities & Referees
External entities that operate across multiple organizations (like centralized referees or independent league officials) are handled systematically:

1.  **System Organizations:** A hidden, top-level "System Organization" (e.g., "Independent Officials" or "Referees Org") is created.
2.  **Centralized Profiles:** Referees have their authoritative `org_profiles` created within this system organization.
3.  **Cross-Org Allocation:** When a host school creates a Game, they can invite/assign these central referee profiles to the match without needing to add the referee to their own local school directory.
4.  **Clean Directories:** This ensures that a school's internal `org_profiles` list strictly contains true members (students, staff, parents), while still allowing the system to robustly track the historical involvement of external officials.

## 5. Image Update Permissions
Because an `org_profile` represents an organization's internal data, the organization has ultimate control over it.

*   By default, only Organization Admins can update the photo (`image`) on an `org_profile`.
*   Organizations can toggle the `allowUserImageUpdates` setting (stored in `organizations.settings`). When enabled, a User who is linked to that `org_profile` can update the persona's photo themselves.
*   Changing an `org_profile` photo never affects the global `user` photo, and vice versa.
