/**
 * Babel config — exists for one transform (architecture M4a).
 *
 * **`import.meta` is a syntax error in the web bundle**, and it is the
 * nastiest failure in this milestone because it does not fail the
 * build. M0 spike 2 traced it:
 *
 *   Uncaught SyntaxError: Cannot use 'import.meta' outside a module
 *
 * `expo export --platform web` exits 0 and writes a valid bundle.
 * Expo then serves that bundle as a classic script —
 * `<script src="/_expo/static/js/web/index-….js" defer>` — and
 * `import.meta` is a syntax error outside a module, so the whole
 * bundle dies before one line of app code runs. A blank page, one
 * console line, and a green CI.
 *
 * The source was a single occurrence in 8.5 MB: Zustand's `devtools`
 * middleware reading `import.meta.env.MODE`. The app never uses
 * `devtools` — it imports `persist` and `createJSONStorage` — but
 * `zustand/middleware` is a barrel and Metro does not tree-shake it
 * out.
 *
 * **Rewriting the syntax rather than chasing that import is
 * deliberate.** Fixing the Zustand import fixes today's bundle and
 * leaves the next dependency free to re-break it with exactly the same
 * silent signature. One transform covers the class.
 *
 * Web only, keyed off the caller's platform. Native is untouched, and
 * the native build must keep passing — this file is shared.
 */

module.exports = function (api) {
  const platform = api.caller((caller) => caller && caller.platform);
  api.cache.using(() => platform);

  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
    plugins: platform === 'web' ? [rewriteImportMeta] : [],
  };
};

/**
 * `import.meta` → `{ env: { MODE: 'production' }, url: '' }`.
 *
 * The shape is what the real thing exposes to the code that reads it:
 * `env.MODE` is what Zustand branches on, and `url` is the other field
 * a dependency is likely to touch. Anything else reads as undefined,
 * which is what a classic script would have given it anyway.
 */
function rewriteImportMeta({ types: t }) {
  return {
    name: 'rewrite-import-meta-for-web',
    visitor: {
      MetaProperty(path) {
        if (
          path.node.meta.name !== 'import' ||
          path.node.property.name !== 'meta'
        ) {
          return;
        }
        path.replaceWith(
          t.objectExpression([
            t.objectProperty(
              t.identifier('env'),
              t.objectExpression([
                t.objectProperty(
                  t.identifier('MODE'),
                  t.stringLiteral('production'),
                ),
              ]),
            ),
            t.objectProperty(t.identifier('url'), t.stringLiteral('')),
          ]),
        );
      },
    },
  };
}
