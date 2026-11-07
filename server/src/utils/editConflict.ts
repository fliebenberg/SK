import type { EditConflict } from '@sk/shared';
import type { Tx } from '../managers/BaseManager';

/**
 * A save refused because what it was based on has changed since (`SYNC-11`). The action handler's
 * catch sends `conflict` with the refusal, so the screen can say who changed what and offer
 * *Save mine anyway*.
 */
export class EditConflictError extends Error {
  constructor(message: string, public readonly conflict: EditConflict) {
    super(message);
    this.name = 'EditConflictError';
  }
}

/**
 * The person who last saved something, as the organisation it belongs to knows them: their active
 * org profile there, else their account name. `null` when nobody is recorded (a save from before
 * `SYNC-11`, or one the server made itself).
 */
export async function nameForUser(tx: Tx, userId: string | null | undefined, orgId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const res = await tx(
    `SELECT COALESCE(
        (SELECT op.name FROM org_profiles op
          WHERE op.user_id = u.id AND op.org_id = $2 AND op.inactive_at IS NULL
          ORDER BY op.name LIMIT 1),
        u.name) AS name
       FROM users u WHERE u.id = $1`,
    [userId, orgId ?? null]
  );
  const name = res.rows[0]?.name;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
}
