import pool from '../../db';
import { tournamentManager } from '../../managers/TournamentManager';

/**
 * The draw is made from locked entries (`FIX-31`): every team answered, then the lock. Scripts that
 * test the draw rather than the answers use these to accept the teams as their organisations would.
 * `test-team-answers.ts` tests the answers and the lock themselves, so it does not.
 */

/** Accepts every invited entrant of a division, then mirrors them into its open stage. */
export async function acceptAll(divisionId: string): Promise<void> {
  await pool.query(`UPDATE division_entrants SET status = 'accepted' WHERE division_id = $1 AND status = 'invited'`, [divisionId]);
  await (tournamentManager as any).syncOpenStageEntrants(divisionId); // what an answer action does after it
}

/** Accepts every invited entrant of a division, then locks its entries so a draw can be made. */
export async function lockForDraw(divisionId: string): Promise<void> {
  await acceptAll(divisionId);
  await tournamentManager.setDivisionLock(divisionId, true, {});
}
