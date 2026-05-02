/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import angular from '@analogjs/vite-plugin-angular';
import { resolve } from 'node:path';

/**
 * Vitest configuration for the Angular dashboard.
 *
 * Two complementary harnesses live in this repo:
 *   - tsx --test (npm run test:pure) — pure TS helpers, fast, no Angular DI
 *     deps, runs against the kernel + helpers in src/app/lib/. Existing
 *     pattern from before this PR; kept as-is for fast smoke runs.
 *   - vitest (npm test) — this harness — covers Angular code: services
 *     with DI, computed signals, components when needed. Backed by jsdom
 *     and the analogjs vite-plugin-angular for template / decorator
 *     compilation parity with `ng build`.
 *
 * Conventions:
 *   - Spec files live next to the code they test as `*.spec.ts`.
 *   - Pure-helper specs may live in either harness; prefer tsx for speed
 *     and reserve Vitest for Angular-shaped code.
 */
// Mirror tsconfig.json's `compilerOptions.paths` aliases so Vite's import
// resolver finds `@services/*`, `@models/*`, etc. — Vite doesn't read
// tsconfig automatically and would otherwise fail with "Failed to resolve
// import" when a spec touches code that uses these aliases.
const aliases = {
  '@app': resolve(__dirname, 'src/app'),
  '@services': resolve(__dirname, 'src/app/services'),
  '@models': resolve(__dirname, 'src/app/models'),
  '@components': resolve(__dirname, 'src/app/components'),
  '@directives': resolve(__dirname, 'src/app/directives'),
  '@content': resolve(__dirname, 'src/app/content'),
};

export default defineConfig({
  plugins: [angular({ tsconfig: resolve(__dirname, 'tsconfig.spec.json') })],
  resolve: { alias: aliases },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.spec.ts'],
    exclude: ['node_modules/**', 'dist/**'],
  },
  define: {
    'import.meta.vitest': 'undefined',
  },
});
