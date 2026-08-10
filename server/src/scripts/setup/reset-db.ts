import pool from '../../db';

const resetDb = async () => {
    try {
        console.log('Resetting Database...');
        await pool.query('BEGIN');
        
        // Cleanly wipe all tables and objects by resetting the public schema
        await pool.query('DROP SCHEMA public CASCADE;');
        await pool.query('CREATE SCHEMA public;');
        await pool.query('GRANT ALL ON SCHEMA public TO public;');
        await pool.query('COMMIT');
        console.log('Database reset successfully.');
        process.exit(0);
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Error resetting database:', error);
        process.exit(1);
    }
};

resetDb();
