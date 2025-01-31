import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    globals: true,
    alias: {
      '@sciurus/app': resolve(__dirname, './packages/app/src'),
      '@sciurus/ecs': resolve(__dirname, './packages/ecs/src'),
      '@sciurus/utils': resolve(__dirname, './packages/utils/src'),
    },
  },
});
