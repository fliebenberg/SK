import pool from '../../db';

export const membershipExpiryJob = async () => {
    try {
        // 1. Find organizations with expired memberships that haven't been processed
        const res = await pool.query(`
            SELECT org_id, COUNT(*) as count
            FROM org_memberships
            WHERE end_date <= NOW() AND expiry_processed = false
            GROUP BY org_id
        `);

        if (res.rowCount === 0) {
            return;
        }

        console.log(`[MembershipExpiryJob] Found ${res.rowCount} organizations with newly expired memberships.`);

        await pool.query('BEGIN');

        for (const row of res.rows) {
            const { org_id, count } = row;
            
            // Decrement member_count
            await pool.query(
                `UPDATE organizations SET member_count = member_count - $1 WHERE id = $2`,
                [parseInt(count), org_id]
            );

            // Mark these as processed
            await pool.query(
                `UPDATE org_memberships 
                 SET expiry_processed = true 
                 WHERE org_id = $1 AND end_date <= NOW() AND expiry_processed = false`,
                [org_id]
            );
        }

        await pool.query('COMMIT');
        console.log(`[MembershipExpiryJob] Successfully processed membership expirations.`);
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('[MembershipExpiryJob] Error processing expirations:', error);
        throw error;
    }
};
