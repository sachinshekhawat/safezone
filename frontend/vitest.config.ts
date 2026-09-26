import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only our own tests — keep node_modules and Next's build output out.
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
