---
name: Test Org Reuse
description: Enforce reuse of the common 'App Test Org' in integration tests to prevent database spam.
---

# Test Organization Reuse & Cleanup Enforcer

To maintain a clean database and avoid "test organization spam", follow these rules for integration tests:

## Core Principles

1. **Reuse Over Re-creation**: Wherever possible, use a single persistent organization for tests:
   - **ID**: `app-test-org`
   - **Name**: `App Test Org`
   
2. **Strict Cleanup**: 
   - If a test *must* create a fresh organization (e.g., testing the exact creation or deletion flow):
     - It **MUST** be deleted in the `afterAll` or `afterEach` hook.
   - **All entities** (teams, sites, events, games, etc.) created during a test **MUST** be deleted at the end of the test unless they are explicitly required for subsequent tests.
   - Dependent entities **MUST** be deleted before the parent (e.g., delete games before events) to satisfy foreign key constraints.

3. **Use Helpers**: Use `TestHelper` in `client/src/__tests__/integration/TestHelper.ts` to manage test data consistently.

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
