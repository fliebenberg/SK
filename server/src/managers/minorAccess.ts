/**
 * The minors rule in SQL: does a membership carry a member's privileges? (`MEMBER-3`)
 *
 * **This must match `memberAccess` in `@sk/shared`**, whose tests are the definition of the rule.
 * The two exist because the rule is needed in both places: the server filters memberships in SQL,
 * where a round trip per row is not an option, and the screens explain the result.
 *
 * - A player is a minor in an org when they have an active guardian link, or their birthdate makes
 *   them younger than the org's minor age (`settings.minors.minorAge`, default 18, 1–21).
 * - A minor's membership carries privileges only if the org allows minors their own account
 *   (`settings.minors.accountsAllowed`, off unless exactly `true`) **and** the minor's own setting
 *   (`org_profiles.own_account_allowed`) is not an explicit `false`.
 *
 * This gates **org-wide privileges only** — `getOrganizationRole`, `getMembershipSnapshot`,
 * `isAdminOrCoach`. Identity (which profiles are yours) and team duties (coach, scorer, organiser
 * grants) are deliberately untouched: a restricted minor is still linked to their profile, still
 * sees the organisation as theirs, and still coaches the team they were appointed to
 * (docs/guardians-implementation-plan.md §0.3).
 *
 * Coming of age: `birthdate > CURRENT_DATE - make_interval(years => n)` makes the birthday itself
 * the first adult day, and a 29 February birthday come of age on 1 March — the same as
 * `isUnderAge`. The obvious `birthdate + interval` form clamps 29 Feb to 28 Feb and disagrees.
 *
 * Every NULL is coalesced on purpose: SQL's three-valued logic would otherwise turn "no birthdate"
 * into NULL and `NOT (NULL AND …)` into a silent refusal.
 */

/** The org's minor age, validated as `minorsSettingsOf` validates it. `orgExpr` is SQL for its id. */
const minorAgeSql = (orgExpr: string) => `COALESCE((
  SELECT CASE
           WHEN (o.settings->'minors'->>'minorAge') ~ '^[0-9]+$'
            AND (o.settings->'minors'->>'minorAge')::int BETWEEN 1 AND 21
           THEN (o.settings->'minors'->>'minorAge')::int
           ELSE 18
         END
    FROM organizations o WHERE o.id = ${orgExpr}
), 18)`;

const orgAllowsMinorsSql = (orgExpr: string) => `COALESCE((
  SELECT (o.settings->'minors'->>'accountsAllowed') = 'true' FROM organizations o WHERE o.id = ${orgExpr}
), false)`;

/** Is profile `p` a minor in the org `orgExpr`? */
export const isMinorSql = (p: string, orgExpr: string) => `(
  EXISTS (
    SELECT 1 FROM profile_guardians pg
     WHERE pg.player_profile_id = ${p}.id AND (pg.end_date IS NULL OR pg.end_date > NOW())
  )
  OR COALESCE(${p}.birthdate > CURRENT_DATE - make_interval(years => ${minorAgeSql(orgExpr)}), false)
)`;

/**
 * True when profile `p`'s membership of org `orgExpr` carries a member's privileges.
 * `p` is a table alias for `org_profiles`; `orgExpr` is SQL naming the org id (usually the
 * membership's `org_id`, the org the privileges would be in).
 */
export const memberPrivilegedSql = (p: string, orgExpr: string) => `NOT (
  ${isMinorSql(p, orgExpr)}
  AND (NOT ${orgAllowsMinorsSql(orgExpr)} OR ${p}.own_account_allowed IS FALSE)
)`;

/**
 * `NULL`, or why the membership is restricted — `'org-off'` or `'minor-off'`, the values of
 * `RestrictedReason` in `@sk/shared`. For the reads that show it, never for a permission check.
 */
export const restrictedReasonSql = (p: string, orgExpr: string) => `CASE
  WHEN NOT ${isMinorSql(p, orgExpr)} THEN NULL
  WHEN NOT ${orgAllowsMinorsSql(orgExpr)} THEN 'org-off'
  WHEN ${p}.own_account_allowed IS FALSE THEN 'minor-off'
  ELSE NULL
END`;
