import pool from '../../db';
import { notificationManager } from '../../managers/NotificationManager';
import { reportManager } from '../../managers/ReportManager';

export const accuracyAuditJob = async () => {
    try {
        console.log('[AccuracyAuditJob] Starting audit for all organizations...');
        
        // Find discrepancies using a single query (batch processing)
        // We use CTEs to avoid correlated subqueries for better performance
        const res = await pool.query(`
            WITH actual_counts AS (
                SELECT 
                    o.id,
                    (SELECT COUNT(*)::int FROM teams t WHERE t.org_id = o.id AND t.is_active = true) as tc,
                    (SELECT COUNT(*)::int FROM org_memberships m WHERE m.org_id = o.id AND (m.end_date IS NULL OR m.end_date > NOW())) as mc,
                    (SELECT COUNT(*)::int FROM sites s WHERE s.org_id = o.id) as sc
                FROM organizations o
            )
            SELECT 
                ac.id, ac.tc as "actualTeams", ac.mc as "actualMembers", ac.sc as "actualSites",
                o.name, o.team_count, o.member_count, o.site_count
            FROM actual_counts ac
            JOIN organizations o ON ac.id = o.id
            WHERE ac.tc != o.team_count OR ac.mc != o.member_count OR ac.sc != o.site_count
        `);

        if (res.rowCount === 0) {
            console.log('[AccuracyAuditJob] No discrepancies found.');
            return;
        }

        console.log(`[AccuracyAuditJob] Found ${res.rowCount} discrepancies. Applying fixes and notifying admins...`);

        await pool.query('BEGIN');

        for (const row of res.rows) {
            const { id, name, actualTeams, actualMembers, actualSites, team_count, member_count, site_count } = row;
            
            // 1. Fix the counts
            await pool.query(
                `UPDATE organizations 
                 SET team_count = $1, member_count = $2, site_count = $3 
                 WHERE id = $4`,
                [actualTeams, actualMembers, actualSites, id]
            );

            // 2. Log a detailed report
            const reason = `Drift detected in ${name} (${id})`;
            const description = `Corrected counts: Teams (${team_count} -> ${actualTeams}), Members (${member_count} -> ${actualMembers}), Sites (${site_count} -> ${actualSites})`;
            
            await reportManager.submitReport({
                reporterUserId: 'system-audit',
                entityType: 'system_audit',
                entityId: id,
                reason: 'other',
                description
            });
        }

        // 3. Notify Global Admins (broad alert)
        const globalAdmins = await pool.query("SELECT id FROM users WHERE global_role = 'admin'");
        for (const admin of globalAdmins.rows) {
            await notificationManager.createNotification(
                admin.id,
                'System Audit Completed',
                `Audit found and corrected ${res.rowCount} organization count discrepancies. See Reports for details.`,
                'system_alert',
                '/admin/reports'
            );
        }

        await pool.query('COMMIT');
        console.log('[AccuracyAuditJob] Audit completed successfully.');
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('[AccuracyAuditJob] Error during audit:', error);
        throw error;
    }
};
