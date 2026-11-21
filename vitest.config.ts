import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Several tests make many real git commits and pushes; the 5 s default is tight on a busy machine.
    testTimeout: 20_000,
  },
});
