# Database Structure

This document describes the database schema for the Sports Manager application. The database is powered by **PostgreSQL**.

## Relationship Diagram (Conceptual)

Below is a simplified view of how the core tables relate to each other:

- **Organizations** own **Sites**, **Facilities**, **Teams**, and **Events**.
- **Sports** are associated with **Organizations**, **Teams**, **Events**, and **Facilities**.
- **Persons/Profiles** belong to **Organizations** and **Teams** via membership tables.
- **Users** are authentication accounts that can be linked to **Persons** (implied via email) and have **Favorites**, **Badges**, and **Notifications**.
- **Events** contain **Games**, which involve **Teams** and take place at **Sites** and **Facilities**.

---

## Tables

### 1. `addresses`
Stores physical locations used by various entities.
- `id` (TEXT, PK)
- `full_address` (TEXT)
- `address_line_1` (TEXT)
- `address_line_2` (TEXT)
- `city` (TEXT)
- `province` (TEXT)
- `postal_code` (TEXT)
- `country` (TEXT)
- `latitude` (DOUBLE PRECISION)
- `longitude` (DOUBLE PRECISION)

### 2. `sports`
Metadata for supported sports.
- `id` (TEXT, PK): Unique identifier (e.g., 'rugby', 'netball').
- `name` (TEXT): Display name of the sport.
- `facility_term` (TEXT): Term used for the sport's facility (e.g., 'Field', 'Court').

### 3. `organizations`
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
- `settings` (JSONB): Organization-specific configuration.
- `address_id` (TEXT): FK to `addresses.id`.

### 4. `sites`
Primary locations managed by an organization (e.g., 'Main Campus').
- `id` (TEXT, PK)
- `name` (TEXT)
- `address_id` (TEXT): FK to `addresses.id`.
- `org_id` (TEXT): FK to `organizations.id`.

### 5. `facilities`
Specific playing areas within a site (e.g., 'A-Field', 'Court 1').
- `id` (TEXT, PK)
- `name` (TEXT)
- `site_id` (TEXT): FK to `sites.id`.
- `primary_sport_id` (TEXT): FK to `sports.id`.
- `address_id` (TEXT): FK to `addresses.id`.
- `surface_type` (TEXT)
- `latitude` (DOUBLE PRECISION)
- `longitude` (DOUBLE PRECISION)

### 6. `teams`
Groups of players representing an organization.
- `id` (TEXT, PK): Unique identifier.
- `name` (TEXT): Team name (e.g., '1st XV').
- `age_group` (TEXT): e.g., 'U19', 'Senior'.
- `sport_id` (TEXT): FK to `sports.id`.
- `org_id` (TEXT): FK to `organizations.id`.
- `is_active` (BOOLEAN): Status toggle.
- `creator_id` (TEXT): User ID who created the team.

### 7. `users`
Authentication and user profile data.
- `id` (TEXT, PK)
- `name` (TEXT)
- `email` (TEXT): UNIQUE.
- `email_verified` (TIMESTAMPTZ)
- `image` (TEXT): Default profile picture.
- `custom_image` (TEXT): User-uploaded image.
- `avatar_source` (TEXT): 'custom' or 'provider'.
- `password_hash` (TEXT)
- `global_role` (TEXT): 'user', 'admin'.
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)
- `preferences` (JSONB)
- `theme` (TEXT)

### 8. `org_profiles`
Core records for individuals in an organization (players, coaches, staff).
- `id` (TEXT, PK): Unique identifier.
- `org_id` (TEXT): FK to `organizations.id`.
- `user_id` (TEXT): FK to `users.id`. Links the profile to an active authentication account.
- `name` (TEXT): Full name.
- `email` (TEXT): Contact email.
- `birthdate` (DATE): Date of birth.
- `national_id` (TEXT): Optional identity number.
- `identifier` (TEXT): Organization-specific ID (e.g., Student Number).
- `image` (TEXT): Organization-specific profile image.
- `primary_role_id` (TEXT): Cached primary organization role for UI convenience.
- *Constraint*: UNIQUE(`org_id`, `identifier`).

### 9. `team_memberships`
Links a profile to a specific team with a role.
- `id` (TEXT, PK)
- `org_profile_id` (TEXT): FK to `org_profiles.id`.
- `team_id` (TEXT): FK to `teams.id`.
- `role_id` (TEXT): e.g., 'player', 'coach'.
- `start_date` (TIMESTAMPTZ)
- `end_date` (TIMESTAMPTZ)

### 10. `org_memberships`
Links a profile to an organization.
- `id` (TEXT, PK)
- `org_profile_id` (TEXT): FK to `org_profiles.id`.
- `org_id` (TEXT): FK to `organizations.id`.
- `role_id` (TEXT): e.g., 'admin', 'staff'.
- `start_date` (TIMESTAMPTZ)
- `end_date` (TIMESTAMPTZ)

### 11. `events`
Tournaments, festivals, or match days.
- `id` (TEXT, PK)
- `name` (TEXT)
- `type` (TEXT)
- `start_date` (TIMESTAMPTZ)
- `end_date` (TIMESTAMPTZ)
- `site_id` (TEXT): FK to `sites.id`.
- `facility_id` (TEXT): FK to `facilities.id`.
- `org_id` (TEXT): FK to `organizations.id`.
- `participating_org_ids` (TEXT[])
- `sport_ids` (TEXT[])
- `settings` (JSONB)
- `status` (TEXT)

### 12. `user_emails`
Support for multiple emails per user.
- `id` (TEXT, PK)
- `user_id` (TEXT): FK to `users.id` (ON DELETE CASCADE).
- `email` (TEXT): UNIQUE.
- `is_primary` (BOOLEAN)
- `verified_at` (TIMESTAMPTZ)
- `created_at` (TIMESTAMPTZ)

### 13. `accounts`
NextAuth accounts (Social providers).
- `id` (TEXT, PK)
- `user_id` (TEXT): FK to `users.id` (ON DELETE CASCADE).
- `type` (TEXT)
- `provider` (TEXT)
- `provider_account_id` (TEXT)
- `refresh_token` (TEXT)
- `access_token` (TEXT)
- `expires_at` (INTEGER)
- `token_type` (TEXT)
- `scope` (TEXT)
- `id_token` (TEXT)
- `session_state` (TEXT)
- `provider_image` (TEXT)
- *Constraint*: UNIQUE(`provider`, `provider_account_id`).

### 14. `sessions`
NextAuth sessions.
- `id` (TEXT, PK)
- `session_token` (TEXT): UNIQUE.
- `user_id` (TEXT): FK to `users.id` (ON DELETE CASCADE).
- `expires` (TIMESTAMPTZ)

### 15. `verification_tokens`
Tokens for email verification.
- `identifier` (TEXT)
- `token` (TEXT)
- `expires` (TIMESTAMPTZ)
- *Constraint*: PRIMARY KEY (`identifier`, `token`).

### 16. `password_reset_tokens`
Tokens for password resets.
- `id` (TEXT, PK)
- `user_id` (TEXT): FK to `users.id` (ON DELETE CASCADE).
- `token_hash` (TEXT)
- `expires_at` (TIMESTAMPTZ)
- `created_at` (TIMESTAMPTZ)

### 17. `user_favorites`
Entities a user follows.
- `id` (TEXT, PK)
- `user_id` (TEXT): FK to `users.id` (ON DELETE CASCADE).
- `entity_type` (TEXT): 'team', 'organization', 'event'.
- `entity_id` (TEXT)
- `created_at` (TIMESTAMPTZ)
- *Constraint*: UNIQUE(`user_id`, `entity_type`, `entity_id`).

### 18. `games`
Specific matches within an event.
- `id` (TEXT, PK)
- `event_id` (TEXT): FK to `events.id` (ON DELETE CASCADE).
- `home_team_id` (TEXT): FK to `teams.id`.
- `away_team_id` (TEXT): FK to `teams.id`.
- `away_team_name` (TEXT)
- `start_time` (TIMESTAMPTZ)
- `status` (TEXT)
- `site_id` (TEXT): FK to `sites.id`.
- `facility_id` (TEXT): FK to `facilities.id`.
- `home_score` (INTEGER)
- `away_score` (INTEGER)

### 19. `org_claim_referrals`
Invites sent to organizations to claim their profile.
- `id` (TEXT, PK)
- `org_id` (TEXT): FK to `organizations.id`.
- `referred_email` (TEXT)
- `referred_by_user_id` (TEXT): FK to `users.id`.
- `claim_token` (TEXT): UNIQUE.
- `claim_token_expires_at` (TIMESTAMPTZ)
- `status` (TEXT): 'pending', 'claimed', 'declined'.
- `claimed_by_user_id` (TEXT): FK to `users.id`.
- `created_at` (TIMESTAMPTZ)
- `claimed_at` (TIMESTAMPTZ)
- `notified_referrer_at` (TIMESTAMPTZ)

### 20. `reports`
User reports for moderation.
- `id` (TEXT, PK)
- `reporter_user_id` (TEXT): FK to `users.id`.
- `entity_type` (TEXT): 'organization', 'event', 'user'.
- `entity_id` (TEXT)
- `reason` (TEXT)
- `description` (TEXT)
- `status` (TEXT): 'open', 'investigating', 'resolved', 'dismissed'.
- `resolved_by_user_id` (TEXT)
- `resolved_at` (TIMESTAMPTZ)
- `created_at` (TIMESTAMPTZ)

### 21. `user_badges`
Gamification rewards.
- `id` (TEXT, PK)
- `user_id` (TEXT): FK to `users.id`.
- `badge_type` (TEXT)
- `earned_at` (TIMESTAMPTZ)
- `metadata` (JSONB)

### 22. `notifications`
System alerts for users.
- `id` (TEXT, PK)
- `user_id` (TEXT): FK to `users.id` (ON DELETE CASCADE).
- `title` (TEXT)
- `message` (TEXT)
- `type` (TEXT)
- `link` (TEXT)
- `is_read` (BOOLEAN)
- `created_at` (TIMESTAMPTZ)

---

## Maintenance

To keep this document updated:
1. Whenever `server/src/scripts/setup/init-db.ts` is modified with new tables or columns, this file must be updated accordingly.
2. Check `shared/src/models/` for interface changes that might indicate new data requirements.
3. Use `npm run db:setup` in development to ensure your local schema matches the source of truth in `init-db.ts`.
