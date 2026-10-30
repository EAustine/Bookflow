/**
 * Features may not form new import cycles.
 *
 * ## Why this is a test and not a lint rule
 *
 * `import/no-cycle` is configured for relative specifiers only, because
 * the ESLint resolver cannot follow `~/*` or the workspace `exports`
 * maps. A cycle built entirely from aliases is therefore invisible to
 * it — in a whole-tree run and a single-file run alike. Open question
 * 16 claimed single-file linting caught one; it does not, and both
 * modes reported zero on a cycle that was really there.
 *
 * The alternative was `eslint-import-resolver-typescript`, a new
 * dependency, and the baseline ESLint config notes that a resolver
 * taught what `tsc` already knows previously produced 333 false
 * positives. So this follows `bootHandoff` and `revenuecatPlan`
 * instead: when the gate cannot see a class of bug, make the check a
 * test.
 *
 * ## Why cycles between features are the ones worth guarding
 *
 * A cycle inside a module pair is usually survivable. Every crossing in
 * `aiAudio` ↔ `audioDownloads` is a hoisted function declaration called
 * at runtime, never read at module-eval time, and that pair is
 * deliberate and documented.
 *
 * Between features is different, because features are reached through
 * barrels and `export *` is evaluated on load. A cycle through one
 * resolves to `undefined` on whichever side loses the race, and the app
 * dies where that binding is used. Not hypothetical: it shipped during
 * M3 and killed the launch with "Cannot read property 'map' of
 * undefined" inside `metroRequire`, having typechecked clean the whole
 * way, because types resolve through a cycle perfectly well.
 *
 * ## Why a baseline instead of zero
 *
 * The first run of this test found that five of the eight features —
 * `ai`, `billing`, `library`, `listen`, `reader` — are already one
 * mutually dependent knot, through ten edges. They are latent rather
 * than broken: every crossing is read inside a component body or an
 * event handler, never at module-eval time. That was equally true of
 * the M3 cycle, right up until it was not.
 *
 * Untangling five features is its own piece of work. So the list below
 * is what the app has and what it may never exceed, and the assertion
 * is an **equality, not a subset**: removing an edge fails this test
 * too, which is the point. A baseline that only ever grows is not a
 * baseline.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const APP_SRC = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../apps/app/src',
);

/**
 * Feature pairs that currently depend on each other, directly or at a
 * remove. Every one is a latent `export *` cycle. **This list may only
 * shrink.**
 */
const KNOWN_FEATURE_CYCLES = [
  'ai -> billing',
  'ai -> reader',
  'billing -> ai',
  'library -> billing',
  'library -> listen',
  'library -> reader',
  'listen -> billing',
  'listen -> reader',
  'reader -> ai',
  'reader -> library',
];

const SOURCE = /\.tsx?$/;
/**
 * `.web.ts` siblings are resolved by Metro only for the web bundle, and
 * never alongside their native counterpart. Modelling the native graph
 * keeps the question answerable: what loads on a device.
 */
const WEB_SIBLING = /\.web\.tsx?$/;

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, found);
    else if (SOURCE.test(entry) && !WEB_SIBLING.test(entry)) found.push(path);
  }
  return found;
}

/**
 * Block comments, and lines that are entirely a line comment. A
 * trailing `//` is left alone on purpose: stripping it would truncate
 * any line holding an `https://` URL, and a comment after a statement
 * cannot contain an import anyway.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

/**
 * Specifiers this module pulls in *at load time*.
 *
 * `import type` and `export type` are erased by the compiler, so they
 * cannot take part in a load-time cycle. Dynamic `import()` is skipped
 * for the same reason: being deferred is one of the ways out of a
 * cycle, not a way into one.
 *
 * `[^;]` keeps a match inside a single statement, which is what lets a
 * multi-line named import be read without a parser.
 */
export function importsOf(source: string): string[] {
  const text = withoutComments(source);
  const specifiers: string[] = [];

  const WITH_FROM =
    /(?:^|\n)[ \t]*(import|export)\b([^;]*?)\bfrom[ \t]*['"]([^'"]+)['"]/g;
  for (const match of text.matchAll(WITH_FROM)) {
    if (!/^\s*type\b/.test(match[2])) specifiers.push(match[3]);
  }

  // Side-effect imports: `import '~/foo';`
  const BARE = /(?:^|\n)[ \t]*import[ \t]*['"]([^'"]+)['"]/g;
  for (const match of text.matchAll(BARE)) specifiers.push(match[1]);

  return specifiers;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Metro's resolution, narrowed to what this codebase actually writes. */
function resolveSpecifier(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith('~/')) base = join(APP_SRC, specifier.slice(2));
  else if (specifier.startsWith('.')) base = resolve(dirname(fromFile), specifier);
  else return null; // A package, not ours.

  return (
    [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      join(base, 'index.ts'),
      join(base, 'index.tsx'),
    ].find(isFile) ?? null
  );
}

function buildGraph(): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const file of sourceFiles(APP_SRC)) {
    const edges: string[] = [];
    for (const specifier of importsOf(readFileSync(file, 'utf8'))) {
      const target = resolveSpecifier(specifier, file);
      if (target && target !== file) edges.push(target);
    }
    graph.set(file, edges);
  }
  return graph;
}

const featureOf = (path: string): string | null =>
  relative(APP_SRC, path).match(/^features[/\\]([^/\\]+)/)?.[1] ?? null;

const graph = buildGraph();

/** `from -> to` for every feature that reaches into another. */
const featureEdges = (() => {
  const edges = new Set<string>();
  for (const [file, targets] of graph) {
    const from = featureOf(file);
    if (!from) continue;
    for (const target of targets) {
      const to = featureOf(target);
      if (to && to !== from) edges.add(`${from} -> ${to}`);
    }
  }
  return edges;
})();

const featureGraph = (() => {
  const adjacency = new Map<string, string[]>();
  for (const edge of featureEdges) {
    const [from, to] = edge.split(' -> ');
    adjacency.set(from, [...(adjacency.get(from) ?? []), to]);
  }
  return adjacency;
})();

function reaches(from: string, to: string): boolean {
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    for (const next of featureGraph.get(queue.shift()!) ?? []) {
      if (next === to) return true;
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

/** The edges that close a loop: `a -> b` where `b` reaches `a` again. */
const cyclicFeatureEdges = [...featureEdges]
  .filter((edge) => {
    const [from, to] = edge.split(' -> ');
    return reaches(to, from);
  })
  .sort();

describe('the app import graph', () => {
  /**
   * A parser that silently matched nothing would make every assertion
   * below pass, which is the one way this test could lie. These pin it
   * to the shape of the real tree.
   */
  it('was actually parsed', () => {
    expect(graph.size).toBeGreaterThan(150);
    expect([...graph.values()].flat().length).toBeGreaterThan(300);
    expect(featureEdges.size).toBeGreaterThan(10);

    // A known edge, so a regex matching nothing cannot pass.
    expect(
      graph.get(join(APP_SRC, 'features/reader/api/useBookChapters.ts')),
    ).toContain(join(APP_SRC, 'core/pageRows.ts'));
  });

  it('resolves `~/` and erases type-only imports', () => {
    // Reaches `core/pageRows` through `~/`, naming `PageRow` as a type
    // in the same statement, so the edge must survive.
    expect(
      graph.get(join(APP_SRC, 'features/listen/api/audioDownloads.ts')),
    ).toContain(join(APP_SRC, 'core/pageRows.ts'));

    // A wholly type-only import is erased, so it is not an edge at all.
    expect(importsOf("import type { PageRow } from '~/features/reader';\n")).toEqual(
      [],
    );
    expect(importsOf("import { usePage } from '~/features/reader';\n")).toEqual([
      '~/features/reader',
    ]);
  });

  /**
   * The assertion this file exists for. The reader/listen cycle that
   * open question 16 described would have reappeared here as
   * `reader -> listen`.
   */
  it('adds no cycle between features', () => {
    expect(cyclicFeatureEdges).toEqual(KNOWN_FEATURE_CYCLES);
  });
});
