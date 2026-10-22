// M0 spike 2 — web boot.
//
// Throwaway alongside metro.config.js; the permanent fix belongs in M4.
//
// The problem: Expo serves the web bundle as a classic <script>, not a
// module, so any `import.meta` anywhere in the graph is a hard
// SyntaxError that kills the entire bundle before a line of app code
// runs. Bundling succeeds — this only shows up at runtime, which is why
// `expo export` reported success.
//
// In this app the single occurrence comes from Zustand's `devtools`
// middleware reading `import.meta.env.MODE`. We never use `devtools`;
// it arrives because `zustand/middleware` is a barrel and Metro does not
// tree-shake it out of the web bundle.
//
// Chasing that one import would fix today's bundle and leave the next
// dependency to re-break it, so this rewrites `import.meta` for web
// instead. Native is untouched.
module.exports = function (api) {
  const platform = api.caller((caller) => (caller ? caller.platform : null));
  api.cache.using(() => platform);

  const plugins = [];

  if (platform === 'web') {
    plugins.push(function importMetaForClassicScript({ types: t }) {
      return {
        name: 'import-meta-for-classic-script',
        visitor: {
          MetaProperty(path) {
            if (
              path.node.meta.name !== 'import' ||
              path.node.property.name !== 'meta'
            ) {
              return;
            }
            // Shape it as the consumers expect: `import.meta.env.MODE`.
            // Anything reading it gets 'production', which is what the
            // exported web build is.
            path.replaceWith(
              t.objectExpression([
                t.objectProperty(
                  t.identifier('env'),
                  t.objectExpression([
                    t.objectProperty(t.identifier('MODE'), t.stringLiteral('production')),
                  ]),
                ),
                t.objectProperty(t.identifier('url'), t.stringLiteral('')),
              ]),
            );
          },
        },
      };
    });
  }

  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};
