# Database Migrations

This directory contains versioned migration scripts for database schema changes.

## Migration Workflow & Execution

1. **Tracking Table (`schema_migrations`)**:
   - Migrations are tracked in the database inside the `schema_migrations` table.
   - When running `npm run db:migrate` (or `ts-node src/scripts/run-all-migrations.ts`), only pending migrations that haven't been applied yet will run.
   - Each migration runs inside an isolated PostgreSQL transaction (`BEGIN` ... `COMMIT`). If an error occurs, the transaction is automatically rolled back (`ROLLBACK`).

2. **Creating a New Migration File**:
   - Create a file with a timestamped name in this folder: `YYYYMMDD_short_description.ts` (e.g. `20260815_add_player_stats.ts`).
   - Export an `up` async function that receives a PostgreSQL `PoolClient`:

   ```typescript
   import { PoolClient } from 'pg';

   export const up = async (client: PoolClient) => {
       await client.query(`
           ALTER TABLE users ADD COLUMN IF NOT EXISTS player_rating DOUBLE PRECISION DEFAULT 0.0;
       `);
   };
   ```

3. **Mandatory Synchronization with `init-db.ts`**:
   - **CRITICAL**: Whenever you create a migration script that alters database structure (adding/modifying tables, columns, indexes, constraints), you **MUST ALSO update [`server/src/scripts/setup/init-db.ts`](file:///c:/Fred/Coding/SK/server/src/scripts/setup/init-db.ts)**.
   - This ensures that fresh database environments built from scratch (`npm run db:init` / `npm run db:setup`) immediately include the latest schema without needing to run legacy migrations.

4. **Schema Inspection Directive for AI Agents & Developers**:
   - Always query the live database directly (e.g. querying `information_schema.columns`) when inspecting or verifying database table structures, column names, and data types.
   - Never assume older TypeScript interfaces or isolated creation scripts are the single source of truth—the live database schema is authoritative.

