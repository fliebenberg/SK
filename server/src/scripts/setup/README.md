# Database Setup Scripts

This directory contains scripts for initializing, resetting, and seeding the ScoreKeeper database.

## Scripts

- **init-db.ts**: Initializes the database schema by creating all necessary tables.
- **reset-db.ts**: Drops all existing tables in the database (use with caution!).
- **seed-db.ts**: Populates the database with initial data (sports, admin user, and mock organizations/members).

## Usage

You can run these scripts using the following npm commands from the `server` directory:

```bash
# Full Reset and Reseed (Recommended for a clean start)
npm run db:setup

# Individual steps:
npm run db:reset  # Wipes the database
npm run db:init   # Creates tables
npm run db:seed   # Seeds data
```

> [!WARNING]
> Running `db:reset` or `db:setup` will DELETE all existing data in your local database. Ensure you have backed up any important data before proceeding.
