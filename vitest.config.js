import { defineConfig } from 'vitest/config';
import { preact } from '@preact/preset-vite';

// Two projects: pure logic runs in Node (with fake-indexeddb), UI tests run in happy-dom.
// A single Node-side test that needs DOMParser opts in with a `@vitest-environment` docblock.
export default defineConfig({
  plugins: [preact({ prefreshEnabled: false, devToolsEnabled: false })],
  resolve: {
    dedupe: ['preact', '@preact/signals-core'],
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'tests/core/**/*.test.{js,jsx}',
            'tests/infrastructure/**/*.test.{js,jsx}',
            'tests/state/**/*.test.{js,jsx}',
            'tests/shared/**/*.test.{js,jsx}',
          ],
          setupFiles: ['tests/helpers/nodeSetup.js'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'happy-dom',
          include: ['tests/ui/**/*.test.{js,jsx}'],
          setupFiles: ['tests/helpers/domSetup.js'],
        },
      },
    ],
  },
});
