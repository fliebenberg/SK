import pool from '../../db';

export const up = async () => {
    console.log('Running migration: Drop organization_memberships');
    await pool.query('BEGIN');
    try {
        await pool.query('DROP TABLE IF EXISTS organization_memberships CASCADE;');
        await pool.query('COMMIT');
        console.log('Successfully dropped organization_memberships');
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Error dropping organization_memberships:', error);
        throw error;
    }
};

export const down = async () => {
    // Cannot accurately recreate down migration without original schema definition, 
    // but this table is redundant anyway as org_memberships is used.
    console.log('Down migration for dropping organization_memberships is a no-op.');
};
