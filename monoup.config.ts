import { defineConfig } from 'monoup';

export default defineConfig({
  monorepo: true,
  sourcemap: false,

  build: {
    main: true,

    typescript: {
      enabled: true,
      declaration: true,
      removeComments: false,
    },

    baseExternals: ['tslib', '@rustable/iter/advanced'],
  },
});
