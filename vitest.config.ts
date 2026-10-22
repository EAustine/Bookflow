import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only the pure packages. apps/app needs a React Native test
    // environment, which M1 deliberately does not set up — CLAUDE.md:
    // tests for high-value logic, not trivial UI rendering.
    include: ['packages/*/src/**/*.test.ts'],
    environment: 'node',
    coverage: { include: ['packages/*/src/**/*.ts'], reporter: ['text'] },
  },
});
