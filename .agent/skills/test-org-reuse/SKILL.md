---
name: Test Org Reuse
description: Start integration tests from the fixed test organisations (fx- ids, sk_test database); older scripts reuse the common 'App Test Org'. Prevents database spam and keeps expected results stable.
---

# Test Organization Reuse & Cleanup Enforcer

To maintain a clean database and avoid "test organization spam", follow these rules for integration tests:

## Start from the test organisations

New tests start from the **test organisations**: a fixed dataset of four organisations with teams,
facilities, staff, players and login accounts, defined in
[fixtures/testOrgs.ts](file:///c:/Fred/Coding/SK/server/src/scripts/setup/fixtures/testOrgs.ts) and
described in the [setup README](file:///c:/Fred/Coding/SK/server/src/scripts/setup/README.md).

- **Run against `sk_test`**, built by `npm run db:test:setup`. Run `npm run db:test-orgs` first to
  put the test organisations back exactly as defined; results can then be stated exactly.
- **Name rows with `fixtureIds`**, never by writing an `fx-…` id out by hand.
- **Add edge cases in the test, not in `testOrgs.ts`.** The file is the shared base; editing it for
  one test changes the expected results of every other test. Give the rows a test adds a `test-`
  id, and delete them at the end, as below.
- **Never use the `fx-` prefix for anything else.** `db:test-orgs` deletes every row whose id or
  `…_id` column starts with it.

The rest of this file is the older convention. The existing scripts still follow it until a test
framework replaces them (`DB-2`).

## Core Principles

1. **Reuse Over Re-creation**: Wherever possible, use a single persistent organization for tests:
   - **ID**: `app-test-org`
   - **Name**: `App Test Org`
   
2. **Strict Cleanup**: 
   - If a test *must* create a fresh organization (e.g., testing the exact creation or deletion flow):
     - It **MUST** be deleted in the `afterAll` or `afterEach` hook.
   - **All entities** (teams, sites, events, games, etc.) created during a test **MUST** be deleted at the end of the test unless they are explicitly required for subsequent tests.
   - Dependent entities **MUST** be deleted before the parent (e.g., delete games before events) to satisfy foreign key constraints.

## Implementation Details

### Reusing the App Test Org

When writing a test that needs an organization:
```typescript
import { APP_TEST_ORG_ID, APP_TEST_ORG_NAME } from '../../../../shared/src/constants/TestConstants';

// In beforeAll
await TestHelper.ensureAppTestOrg(socket);
```

### Automatic Cleanup

Tests that create dynamic organizations should follow this pattern:
```typescript
const ORG_ID = `test-org-${Date.now()}`;

afterAll(async () => {
    await TestHelper.cleanupOrg(socket, ORG_ID);
});
```

## Why this matters
Excessive unused organizations bloat the database, slow down searches, and make debugging difficult. Maintaining a clean test environment is crucial for consistent CI/CD and developer experience.
