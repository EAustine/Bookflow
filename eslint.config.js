/**
 * Import boundaries — §4 of docs/ARCHITECTURE.md.
 *
 * §4 states four rules. Until M1 they were prose, which meant the only
 * thing enforcing them was whoever happened to review the diff. These
 * are the ones expressible today; the `features/*` rules arrive with
 * `features/*` in M3, and are written here already so the structure
 * cannot land without them.
 *
 *   1. A feature may import ui, core, platform, layouts, @bookflow/shared
 *   2. A feature never reaches into another feature's internals
 *   3. ui never imports from features
 *   4. Only platform/* may import native-only or web-only packages
 *
 * Rule 4 is the load-bearing one: it is what keeps the web build
 * possible. M0 spike 2 found ten native-only packages imported directly
 * from screens and lib; every one is a violation this rule will catch
 * once M4 has somewhere for them to go.
 */
const expoConfig = require('eslint-config-expo/flat');

/** The packages that only exist on a native device. From M0 spike 2. */
const NATIVE_ONLY = [
  'react-native-pdf',
  'react-native-purchases',
  'expo-audio',
  'expo-speech',
  'expo-file-system',
  'expo-document-picker',
  'expo-image-picker',
  'expo-notifications',
  'expo-share-intent',
  'expo-clipboard',
  'expo-haptics',
  'expo-secure-store',
];

module.exports = [
  ...expoConfig,

  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'spikes/**',
      'apps/site/**',
      // Deno, not Node. `npm:` and `jsr:` specifiers are valid there and
      // unresolvable here, so linting them with Node resolution produces
      // 400 errors that say nothing about the code. Deno has its own
      // linter if these ever need one.
      'supabase/functions/**',
    ],
  },

  // ── Baseline ────────────────────────────────────────────────────────
  //
  // `tsc --noEmit` runs in the same CI job and is the authority on module
  // resolution — it already understands the `~/*` path alias and the
  // workspace `exports` maps. A second resolver taught the same thing is
  // a config to keep in sync for no new signal, and it currently reports
  // 333 false positives on imports tsc resolves fine.
  //
  // The rest are pre-existing and cosmetic: 45 unescaped apostrophes in
  // copy, and assorted style nits. They predate M1. Warnings keep them
  // visible without making the first green CI run depend on a 500-line
  // style sweep that would bury the structural diff.
  {
    rules: {
      'import/no-unresolved': 'off',
      'react/no-unescaped-entities': 'warn',
    },
  },

  // ── Environments the Expo preset does not assume ────────────────────
  {
    // Build-time Node scripts: `process`, `console`, `URL`, `Buffer`.
    files: ['**/scripts/**/*.{mjs,js}', '*.config.{js,mjs,ts}', 'vitest.config.ts'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly',
                 URL: 'readonly', __dirname: 'readonly', fetch: 'readonly' },
    },
    rules: { 'no-undef': 'off' },
  },
  {
    // Runs in JavaScriptCore inside the iOS share extension, not in the
    // app bundle — `var` there is the platform's own idiom, not ours.
    files: ['**/ShareExtensionPreprocessor.js'],
    rules: { 'no-var': 'off' },
  },

  // ── Rule 4 — native-only packages live behind platform/* ────────────
  //
  // Reported as a warning, not an error. Twenty-one call sites violate
  // it today and M4 is where they move; failing the build now would mean
  // either a red CI for three milestones or a blanket disable, and a
  // blanket disable is how a rule quietly stops existing.
  {
    files: ['apps/app/src/**/*.{ts,tsx}', 'apps/app/App.tsx'],
    ignores: ['apps/app/src/platform/**'],
    rules: {
      'no-restricted-imports': ['warn', {
        paths: NATIVE_ONLY.map((name) => ({
          name,
          message:
            `${name} is native-only. Reach it through src/platform/* so the web build can resolve it (§8). ` +
            'This is a warning until M4 moves the call sites.',
        })),
      }],
    },
  },

  // ── Rules 1-3 — feature and layer boundaries ────────────────────────
  {
    files: ['apps/app/src/features/*/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['~/features/*/*', '../*/!(index)', '../../*/!(index)'],
          message:
            'Import another feature through its public index.ts, not its internals (§4 rule 1).',
        }],
      }],
    },
  },
  {
    files: ['apps/app/src/ui/**/*.{ts,tsx}', 'apps/app/src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['~/features/*', '~/screens/*'],
          message:
            'ui must not import from features or screens — the dependency runs the other way (§4 rule 2).',
        }],
      }],
    },
  },

  // ── packages/shared is platform-free by definition ──────────────────
  {
    files: ['packages/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          ...NATIVE_ONLY.map((name) => ({ name, message: `@bookflow/shared must stay platform-free.` })),
          { name: 'react', message: '@bookflow/shared must stay platform-free.' },
          { name: 'react-native', message: '@bookflow/shared must stay platform-free.' },
        ],
      }],
    },
  },
];
