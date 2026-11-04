import { Tx } from './BaseManager';

/**
 * Whether an org profile is active (docs/people.md §9). This is about a person's record in **one
 * organisation**: their user account, and their org profiles elsewhere, are never touched.
 *
 * Someone with no part left in an organisation has their org profile made inactive. It stays on
 * record, details and all, so match histories keep working, but it holds nothing: its email and org
 * ID are free for an active profile to use, it gives no access, and pickers do not offer it. A person
 * who returns gets the same org profile back, if whoever adds them says it is the same person.
 *
 * The rights an org profile carries come from current memberships, team roles, guardian links and
 * appointments, so making one inactive ends or checks those first. `AccessManager.PROFILE_IDS_FOR_USER`
 * skipping inactive profiles is the second lock on the same door.
 */

type Run = Tx;

const CURRENT = (alias: string) => `(${alias}.end_date IS NULL OR ${alias}.end_date > NOW())`;
const EVENT_NOT_OVER = `(COALESCE(e.end_date, e.start_date) IS NULL OR COALESCE(e.end_date, e.start_date) >= CURRENT_DATE)`;

/**
 * What keeps this person in the organisation apart from being a guardian, in words for a refusal:
 * a membership, a team role, an appointment to a tournament that is not over, a game still to be
 * played. Past games and tournaments are history, not a part.
 */
export async function otherPartsInOrg(run: Run, profileId: string): Promise<string[]> {
  const res = await run(
    `SELECT 'a membership' AS part
       FROM org_memberships om WHERE om.org_profile_id = $1 AND ${CURRENT('om')}
     UNION ALL
     SELECT 'a role on ' || t.name
       FROM team_memberships tm JOIN teams t ON t.id = tm.team_id
      WHERE tm.org_profile_id = $1 AND ${CURRENT('tm')}
     UNION ALL
     SELECT 'organising ' || e.name
       FROM event_organizers eo JOIN events e ON e.id = eo.event_id
      WHERE eo.org_profile_id = $1 AND ${EVENT_NOT_OVER}
     UNION ALL
     SELECT 'organising ' || e.name
       FROM event_sport_organizers eso JOIN events e ON e.id = eso.event_id
      WHERE eso.org_profile_id = $1 AND ${EVENT_NOT_OVER}
     UNION ALL
     SELECT 'organising ' || e.name
       FROM division_organizers dorg
       JOIN tournament_divisions d ON d.id = dorg.division_id
       JOIN events e ON e.id = d.event_id
      WHERE dorg.org_profile_id = $1 AND ${EVENT_NOT_OVER}
     UNION ALL
     SELECT 'being entered in ' || e.name
       FROM division_entrants de
       JOIN tournament_divisions d ON d.id = de.division_id
       JOIN events e ON e.id = d.event_id
      WHERE de.org_profile_id = $1 AND de.status NOT IN ('declined', 'rejected', 'withdrawn') AND ${EVENT_NOT_OVER}
     UNION ALL
     SELECT 'officiating a game still to be played'
       FROM game_officials go JOIN games g ON g.id = go.game_id
      WHERE go.org_profile_id = $1 AND g.status IN ('Scheduled', 'Live')`,
    [profileId]
  );
  return [...new Set(res.rows.map((r: any) => r.part as string))];
}

/** Is this person a guardian of anyone just now? */
async function isGuardian(run: Run, profileId: string): Promise<boolean> {
  const res = await run(
    `SELECT 1 FROM profile_guardians pg WHERE pg.guardian_profile_id = $1 AND ${CURRENT('pg')} LIMIT 1`,
    [profileId]
  );
  return (res.rowCount ?? 0) > 0;
}

/** Make this org profile inactive, if they have no part left in the organisation. True if it did. */
export async function deactivateIfNoPartLeft(run: Run, profileId: string): Promise<boolean> {
  if (await isGuardian(run, profileId)) return false;
  if ((await otherPartsInOrg(run, profileId)).length) return false;
  const res = await run('UPDATE org_profiles SET inactive_at = NOW() WHERE id = $1 AND inactive_at IS NULL', [profileId]);
  return (res.rowCount ?? 0) > 0;
}

/**
 * Bring someone back. Their old email or org ID may have gone to someone else meanwhile; the
 * uniqueness rules hold, so they come back without it, and whoever brought them back can add a new one.
 * Does nothing for a profile that is already active.
 */
export async function reactivateOrgProfile(run: Run, profileId: string): Promise<void> {
  const profile = (await run(
    'SELECT org_id, email, identifier, inactive_at FROM org_profiles WHERE id = $1 FOR UPDATE',
    [profileId]
  )).rows[0];
  if (!profile?.inactive_at) return;
  await run(
    `UPDATE org_profiles me SET inactive_at = NULL,
            email = CASE WHEN EXISTS (
              SELECT 1 FROM org_profiles other
               WHERE other.org_id = me.org_id AND other.id <> me.id AND other.inactive_at IS NULL
                 AND LOWER(TRIM(other.email)) = LOWER(TRIM(me.email))
            ) THEN NULL ELSE me.email END,
            identifier = CASE WHEN EXISTS (
              SELECT 1 FROM org_profiles other
               WHERE other.org_id = me.org_id AND other.id <> me.id AND other.inactive_at IS NULL
                 AND other.identifier = me.identifier
            ) THEN NULL ELSE me.identifier END
      WHERE me.id = $1`,
    [profileId]
  );
}
