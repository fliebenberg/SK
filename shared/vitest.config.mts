import { defineConfig } from 'vitest/config';

/**
 * Vitest lives in `shared/` and nowhere else (implementation plan, "How each phase is verified").
 *
 * This is a plain TypeScript package - no React Native, no sockets, no database - so the whole
 * setup is one dev dependency and this file. `server/` and `expo-app/` keep using `ts-node`
 * scripts and named manual checks until a disposable test database justifies a real harness.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
