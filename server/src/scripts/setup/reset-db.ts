import pool from '../../db';

const resetDb = async () => {
    // One client for the whole run: through the pool, BEGIN and COMMIT could land on different
    // connections, so the statements between them would not be a transaction at all (TX-1).
    const client = await pool.connect();
    try {
        console.log('Resetting Database...');
        await client.query('BEGIN');
        
        // Cleanly wipe all tables and objects by resetting the public schema
        await client.query('DROP SCHEMA public CASCADE;');
        await client.query('CREATE SCHEMA public;');
        await client.query('GRANT ALL ON SCHEMA public TO public;');
        await client.query('COMMIT');
        console.log('Database reset successfully.');
        process.exit(0);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error resetting database:', error);
        process.exit(1);
    }
};

resetDb();
