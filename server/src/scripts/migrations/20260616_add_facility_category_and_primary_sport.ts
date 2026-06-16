import pool from '../../db';

export async function up(): Promise<void> {
  await pool.query(`
    ALTER TABLE facilities ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'other';
    ALTER TABLE facilities ADD COLUMN IF NOT EXISTS primary_sport_id TEXT REFERENCES sports(id) ON DELETE SET NULL;
  `);
}

export async function down(): Promise<void> {
  await pool.query(`
    ALTER TABLE facilities DROP COLUMN IF EXISTS category;
    ALTER TABLE facilities DROP COLUMN IF EXISTS primary_sport_id;
  `);
}

if (require.main === module) {
  up()
    .then(() => {
      console.log('Migration completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

