"use strict";
/**
 * Constants used for testing across the application.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEST_ORG_ID_PATTERNS = exports.APP_TEST_ORG_NAME = exports.APP_TEST_ORG_ID = void 0;
exports.APP_TEST_ORG_ID = 'app-test-org';
exports.APP_TEST_ORG_NAME = 'App Test Org';
/**
 * Patterns for identifying test organizations that should be cleaned up.
 */
exports.TEST_ORG_ID_PATTERNS = [
    'org-del-test-',
    'same-org-test-',
    'org-lifecycle-test-',
    'org-site-test-',
    'org-test-listener-',
    'org-test-actor-',
    'org-with-team-',
    'site-del-test-',
    'facility-del-test-',
    'event-del-test-',
    'game-del-test-',
    'team-test-'
];
