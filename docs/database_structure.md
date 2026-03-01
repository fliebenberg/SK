# Database Structure

This document describes the database schema for the Sports Manager application. The database is powered by **PostgreSQL**.

## Relationship Diagram (Conceptual)

Below is a simplified view of how the core tables relate to each other:

- **Organizations** own **Venues**, **Teams**, and **Events**.
- **Sports** are associated with **Organizations**, **Teams**, and **Events**.
- **Persons/Profiles** belong to **Organizations** and **Teams** via membership tables.
- **Users** are authentication accounts that can be linked to **Persons** (implied via email) and have **Favorites**, **Badges**, and **Notifications**.
- **Events** contain **Games**, which involve **Teams** and **Venues**.

---

## Tables

### 1. `sports`
Metadata for supported sports.
- `id` (TEXT, PK): Unique identifier (e.g., 'rugby', 'netball').
- `name` (TEXT): Display name of the sport.

### 2. `organizations`
High-level entities like schools, clubs, or federations.
- `id` (TEXT, PK): Unique identifier.
- `name` (TEXT): Full name of the organization.
- `short_name` (TEXT): Abbreviated name.
- `logo` (TEXT): URL or path to the logo image.
- `primary_color` (TEXT): CSS-compatible color code.
- `secondary_color` (TEXT): CSS-compatible color code.
- `supported_sport_ids` (TEXT[]): Array of sport IDs offered by the org.
- `supported_role_ids` (TEXT[]): Roles available within the org.
- `is_claimed` (BOOLEAN): Whether the org has been claimed by a user.
- `creator_id` (TEXT): User ID who added the org.
- `is_active` (BOOLEAN): Status toggle.

### 3. `venues`
Physical locations where games take place.
- `id` (TEXT, PK): Unique identifier.
- `name` (TEXT): Name of the venue (e.g., 'Main Field').
- `address` (TEXT): Physical address.
- `organization_id` (TEXT): FK to `organizations.id`.

### 4. `teams`
Groups of players representing an organization.
- `id` (TEXT, PK): Unique identifier.
- `name` (TEXT): Team name (e.g., '1st XV').
- `age_group` (TEXT): e.g., 'U19', 'Senior'.
- `sport_id` (TEXT): FK to `sports.id`.
- `organization_id` (TEXT): FK to `organizations.id`.
- `is_active` (BOOLEAN): Status toggle.
- `creator_id` (TEXT): User ID who created the team.

### 5. `org_profiles`
Core records for individuals in an organization (players, coaches, staff). Replaces global `persons` table.
- `id` (TEXT, PK): Unique identifier.
- `organization_id` (TEXT): FK to `organizations.id`.
- `user_id` (TEXT): FK to `users.id`. Links the profile to an active authentication account.
- `name` (TEXT): Full name.
- `email` (TEXT): Contact email.
- `birthdate` (DATE): Date of birth.
- `national_id` (TEXT): Optional identity number.
- `identifier` (TEXT): Organization-specific ID (e.g., Student Number).
- `image` (TEXT): Organization-specific profile image.
- `primary_role_id` (TEXT): Cached primary organization role for UI convenience.
- *Constraint*: UNIQUE(`organization_id`, `identifier`).

### 6. `team_memberships`
Links a profile to a specific team with a role.
- `id` (TEXT, PK): Unique identifier.
- `org_profile_id` (TEXT): FK to `org_profiles.id`.
- `team_id` (TEXT): FK to `teams.id`.
- `role_id` (TEXT): e.g., 'player', 'coach'.
- `start_date` (TIMESTAMPTZ): Start of membership.
- `end_date` (TIMESTAMPTZ): End of membership.

### 7. `organization_memberships`
Links a profile to an organization.
- `id` (TEXT, PK): Unique identifier.
- `org_profile_id` (TEXT): FK to `org_profiles.id`.
- `organization_id` (TEXT): FK to `organizations.id`.
- `role_id` (TEXT): e.g., 'admin', 'staff'.
- `start_date` (TIMESTAMPTZ).
- `end_date` (TIMESTAMPTZ).

### 9. `events`
Tournaments, festivals, or match days.
- `id` (TEXT, PK).
- `name` (TEXT).
- `type` (TEXT).
- `start_date` (TIMESTAMPTZ).
- `end_date` (TIMESTAMPTZ).
- `venue_id` (TEXT): Location of the event.
- `organization_id` (TEXT): FK to `organizations.id`.
- `participating_org_ids` (TEXT[]): List of orgs involved.
- `sport_ids` (TEXT[]).
- `settings` (JSONB): Custom configuration.
- `status` (TEXT): e.g., 'scheduled', 'ongoing', 'completed'.

### 10. `games`
Specific matches within an event.
- `id` (TEXT, PK).
- `event_id` (TEXT): FK to `events.id` (ON DELETE CASCADE).
- `home_team_id` (TEXT): FK to `teams.id`.
- `away_team_id` (TEXT): FK to `teams.id`.
- `away_team_name` (TEXT): Used if away team isn't in the system.
- `start_time` (TIMESTAMPTZ).
- `status` (TEXT).
- `venue_id` (TEXT).
- `home_score` (INTEGER).
- `away_score` (INTEGER).

### 11. `users`
Authentication and user profile data.
- `id` (TEXT, PK).
- `name` (TEXT).
- `email` (TEXT): UNIQUE.
- `email_verified` (TIMESTAMPTZ).
- `image` (TEXT): Default profile picture.
- `custom_image` (TEXT): User-uploaded image.
- `avatar_source` (TEXT): 'custom' or 'provider'.
- `password_hash` (TEXT).
- `global_role` (TEXT): 'user', 'admin'.
- `preferences` (JSONB).
- `theme` (TEXT).
- `created_at`, `updated_at` (TIMESTAMPTZ).

### 12. `user_emails`
Support for multiple emails per user.
- `id` (TEXT, PK).
- `user_id` (TEXT): FK to `users.id` (ON DELETE CASCADE).
- `email` (TEXT): UNIQUE.
- `is_primary` (BOOLEAN).
- `verified_at` (TIMESTAMPTZ).

### 13. `accounts`, `sessions`, `verification_tokens`
Standard NextAuth tables for social login and session management.

### 14. `password_reset_tokens`
- `id` (TEXT, PK).
- `user_id` (TEXT): FK to `users.id` (ON DELETE CASCADE).
- `token_hash` (TEXT).
- `expires_at` (TIMESTAMPTZ).

### 15. `user_favorites`
Entities a user follows.
- `id` (TEXT, PK).
- `user_id` (TEXT): FK to `users.id`.
- `entity_type` (TEXT): 'team', 'organization', 'event'.
- `entity_id` (TEXT).

### 16. `org_claim_referrals`
Invites sent to organizations to claim their profile.
- `id` (TEXT, PK).
- `organization_id` (TEXT): FK to `organizations.id`.
- `referred_email` (TEXT).
- `referred_by_user_id` (TEXT): FK to `users.id`.
- `claim_token` (TEXT): UNIQUE.
- `status` (TEXT): 'pending', 'claimed', 'declined'.
- `claimed_by_user_id` (TEXT): FK to `users.id`.

### 17. `reports`
User reports for moderation.
- `id` (TEXT, PK).
- `reporter_user_id` (TEXT): FK to `users.id`.
- `entity_type` (TEXT): 'organization', 'event', 'user'.
- `entity_id` (TEXT).
- `reason` (TEXT).
- `status` (TEXT).
- `resolved_by_user_id` (TEXT).

### 18. `user_badges`
Gamification rewards.
- `id` (TEXT, PK).
- `user_id` (TEXT): FK to `users.id`.
- `badge_type` (TEXT).
- `metadata` (JSONB).

### 19. `notifications`
System alerts for users.
- `id` (TEXT, PK).
- `user_id` (TEXT): FK to `users.id` (ON DELETE CASCADE).
- `title`, `message` (TEXT).
- `type` (TEXT).
- `link` (TEXT).
- `is_read` (BOOLEAN).

---

## Maintenance

To keep this document updated:
1. Whenever `server/src/scripts/init-db.ts` is modified with new tables or columns, this file must be updated accordingly.
2. Check `shared/src/models/` for interface changes that might indicate new data requirements.
3. Use `npm run db:setup` in development to ensure your local schema matches the source of truth in `init-db.ts`.
