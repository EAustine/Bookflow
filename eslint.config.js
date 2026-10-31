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

/**
 * The packages that only exist on a native device. M0 spike 2 found
 * ten; `react-native-webview` and `react-native-purchases-ui` are the
 * two it missed — the first named in §8's reader-host prose but absent
 * from the list, the second not yet a dependency when the spike ran.
 *
 * `expo-haptics` and `expo-secure-store` are not installed and nothing
 * imports them, so their rows cannot fire today. They stay because the
 * cost is nil and the day someone adds `expo-haptics` is exactly when
 * this rule should be waiting.
 */
const NATIVE_ONLY = [
  'react-native-pdf',
  'react-native-webview',
  'react-native-purchases',
  'react-native-purchases-ui',
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

/**
 * Rule 4 as `no-restricted-imports` paths — spread into **every** block
 * below that sets that rule.
 *
 * It has to be every one, because a later block setting the same rule
 * key REPLACES the earlier config rather than merging into it. That is
 * the hole M4b found: the `features/*` block set only `patterns`, which
 * silently dropped these paths for every file beneath it, and M3 had
 * moved nearly all the app under `features/`. The rule reported five
 * violations when there were twenty-four, and all nineteen it missed
 * were under `features/` — no exceptions, which is what made the
 * diagnosis certain rather than likely.
 *
 * A rule that cannot see most of the app is worse than no rule, because
 * its zero reads as an all-clear. If you add a block here that sets
 * `no-restricted-imports`, spread this in.
 */
const nativeOnlyPaths = NATIVE_ONLY.map((name) => ({
  name,
  message:
    `${name} is native-only. Reach it through src/platform/* so the web ` +
    'build can resolve it (§4 rule 4, §8).',
}));

/**
 * Barrels that pull a whole library in for one named export.
 *
 * These are **exact specifiers**, which is the whole trick: `paths`
 * matches the import string exactly, so `@tabler/icons-react-native` is
 * banned while `@tabler/icons-react-native/IconBook` is not. Nothing
 * needs an exemption, because after M4c nothing legitimately imports
 * the roots.
 *
 * Measured in M4c, on the web export:
 *
 *   `@tabler/icons-react-native` re-exports ~6,000 icons and Metro does
 *   not tree-shake those re-exports. One named import from the root
 *   cost **4.6 MB of an 8.5 MiB bundle, 53% of it**, for 68 icons. Per
 *   icon it is 28.8 KB in total.
 *
 *   Each `@expo-google-fonts/*` root does an eager top-level
 *   `require()` of every weight it ships. Seven faces were being asked
 *   for; 52 `.ttf` files and 6.7 MB were being shipped.
 *
 * Both are invisible to every other check in CI. They typecheck, they
 * lint, they bundle, they boot, and they render correctly. The only
 * symptom is the size, which is why this is a lint error and why
 * `scripts/check-bundle-size.mjs` exists as well: this rule catches the
 * two known causes by name, and the budget catches the next one.
 */
const barrelPaths = [
  {
    name: '@tabler/icons-react-native',
    message:
      'Import one icon per module: `@tabler/icons-react-native/IconFoo`. ' +
      'The package root re-exports ~6,000 icons and Metro does not ' +
      'tree-shake them, so naming the root costs 4.6 MB (M4c). Screens ' +
      'should use `~/components` Icon anyway.',
  },
  ...['fraunces', 'geist', 'lexend', 'literata'].map((family) => ({
    name: `@expo-google-fonts/${family}`,
    message:
      `Import one weight per module: '@expo-google-fonts/${family}/400Regular'. ` +
      'The package root eagerly requires every weight it ships, which put ' +
      '52 font files and 6.7 MB in the export for the seven the app uses (M4c).',
  })),
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
  // An error as of M4b, which is when the last adapter landed and the
  // count reached zero. It was a warning for three milestones because
  // the call sites genuinely had nowhere to go: failing the build then
  // would have meant either a red CI throughout or a blanket disable,
  // and a blanket disable is how a rule quietly stops existing.
  //
  // The comment here used to read "twenty-one call sites violate it
  // today". That number was not stale by drift — it was frozen at the
  // moment the rule went blind to `features/`. See `nativeOnlyPaths`.
  //
  // `apps/app/app/` is in the glob now. Routes were never covered, and
  // nothing violated it there, which is the kind of luck a gate should
  // not be resting on. `apps/app/App.tsx` is gone from it: the file was
  // deleted in #18 and a glob naming a missing file looks like coverage
  // without being any.
  {
    files: ['apps/app/src/**/*.{ts,tsx}', 'apps/app/app/**/*.{ts,tsx}'],
    ignores: ['apps/app/src/platform/**'],
    rules: {
      'no-restricted-imports': ['error', { paths: [...nativeOnlyPaths, ...barrelPaths] }],
    },
  },

  // ── Rules 1-3 — feature and layer boundaries ────────────────────────
  //
  // The relative patterns are depth-sensitive, and every source file in a
  // feature sits at features/<name>/<api|screens>/<file>. From there
  // `../<dir>/<file>` is the SAME feature and `../../<name>/<dir>` is a
  // different one.
  //
  // `../*/!(index)` was in this group until 2026-10-28, which made a
  // feature's own screens/ -> api/ import a lint error and pushed every
  // one of them onto `../index`. Since index.ts re-exports those same
  // files, that is a cycle, and a cycle evaluates to `undefined` on one
  // side at module load: the app died at launch with "Cannot read
  // property 'map' of undefined" inside metroRequire. tsc cannot see it
  // — types resolve through a cycle — so the decomposition typechecked
  // clean and still shipped a crash. The barrel is a feature's public
  // face, not its internal switchboard.
  {
    files: ['apps/app/src/features/*/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [...nativeOnlyPaths, ...barrelPaths],
        patterns: [
          {
            group: ['~/features/*/*', '../../*/!(index)'],
            message:
              'Import another feature through its public index.ts, not its internals (§4 rule 1).',
          },
          {
            // A file inside a feature must never import that feature's
            // own barrel. See the note above.
            group: ['../index', '../../index'],
            message:
              "Don't import your own feature's index.ts — it re-exports this file, and the " +
              'cycle resolves to undefined at module load. Import the defining module directly.',
          },
        ],
      }],
    },
  },

  // ── Cycles ──────────────────────────────────────────────────────────
  //
  // The guard the barrel crash needed and did not have. `no-restricted-
  // imports` above bans the one shape that caused it; this catches the
  // shape nobody has thought of yet.
  //
  // Scoped to relative specifiers only: `import/no-unresolved` is off
  // because the resolver cannot follow `~/*` or the workspace exports
  // maps, so no-cycle cannot trace a cycle that runs through an alias
  // either. Relative edges are what barrels are built from, which is
  // where this class of bug actually lives.
  {
    files: ['apps/app/src/**/*.{ts,tsx}', 'packages/shared/src/**/*.ts'],
    rules: {
      'import/no-cycle': ['error', { maxDepth: 6, ignoreExternal: true }],
    },
  },
  {
    files: ['apps/app/src/ui/**/*.{ts,tsx}', 'apps/app/src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [...nativeOnlyPaths, ...barrelPaths],
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
