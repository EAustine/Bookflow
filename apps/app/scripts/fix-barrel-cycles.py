#!/usr/bin/env python3
"""
Repoint intra-feature imports away from the feature's own barrel.

The M3 decomposition rewrote every `~/features/<name>` import to
`../index` when the importing file was itself inside that feature. That
creates a cycle — `index.ts` re-exports the file, the file imports
`index.ts` — and a cycle resolves to `undefined` on one side at module
eval time. The app crashed at launch with "Cannot read property 'map'
of undefined" inside metroRequire.

`tsc` cannot see this. Types resolve fine through a cycle; the failure
is initialisation order at runtime, which is why the decomposition
typechecked clean and still shipped a crash.

Fix: resolve each imported symbol to the file that actually defines it
and import from there. Cross-feature imports still go through the
barrel, which is the §4 rule and is not circular.
"""
import io
import os
import re
import sys

FEATURES = 'src/features'


def exported_symbols(path: str) -> set[str]:
    """Names a module exports directly (not via re-export)."""
    src = io.open(path, encoding='utf-8').read()
    names: set[str] = set()
    for m in re.finditer(
        r'^export\s+(?:async\s+)?(?:function|const|let|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)',
        src, re.M,
    ):
        names.add(m.group(1))
    # `export { A, B as C }` — the exported name is what matters.
    for m in re.finditer(r'^export\s*\{([^}]*)\}(?!\s*from)', src, re.M):
        for part in m.group(1).split(','):
            part = part.strip()
            if not part:
                continue
            names.add(part.split(' as ')[-1].strip())
    return names


def build_index(feature_dir: str) -> dict[str, str]:
    """symbol -> module path, for every file in the feature except index."""
    out: dict[str, str] = {}
    for root, _, files in os.walk(feature_dir):
        for f in files:
            if not f.endswith(('.ts', '.tsx')) or f == 'index.ts':
                continue
            p = os.path.join(root, f)
            for name in exported_symbols(p):
                out.setdefault(name, p)
    return out


def rel_specifier(from_file: str, to_file: str) -> str:
    rel = os.path.relpath(to_file, os.path.dirname(from_file))
    rel = re.sub(r'\.tsx?$', '', rel)
    return rel if rel.startswith('.') else './' + rel


def main() -> int:
    total, touched, unresolved = 0, 0, []
    for feature in sorted(os.listdir(FEATURES)):
        fdir = os.path.join(FEATURES, feature)
        if not os.path.isdir(fdir):
            continue
        symbol_to_file = build_index(fdir)

        for root, _, files in os.walk(fdir):
            for f in files:
                if not f.endswith(('.ts', '.tsx')) or f == 'index.ts':
                    continue
                path = os.path.join(root, f)
                src = io.open(path, encoding='utf-8').read()
                if "'../index'" not in src:
                    continue
                orig = src

                # Each `import { ... } from '../index'` becomes one import
                # per defining file, so symbols from different modules do
                # not get collapsed onto one wrong path.
                def replace(m: re.Match) -> str:
                    prefix, body = m.group(1), m.group(2)
                    by_file: dict[str, list[str]] = {}
                    for raw in body.split(','):
                        raw = raw.strip()
                        if not raw:
                            continue
                        name = raw.split(' as ')[0].replace('type ', '').strip()
                        target = symbol_to_file.get(name)
                        if not target or os.path.abspath(target) == os.path.abspath(path):
                            # Defined here, or not found — leave it for a human.
                            unresolved.append(f'{path}: {name}')
                            by_file.setdefault('../index', []).append(raw)
                            continue
                        by_file.setdefault(rel_specifier(path, target), []).append(raw)
                    return '\n'.join(
                        f"{prefix} {{ {', '.join(items)} }} from '{spec}';"
                        for spec, items in by_file.items()
                    )

                src = re.sub(
                    r"(import(?:\s+type)?)\s*\{([^}]*)\}\s*from\s*'\.\./index';",
                    replace, src,
                )
                if src != orig:
                    io.open(path, 'w', encoding='utf-8').write(src)
                    touched += 1
                total += 1

    print(f'  rewrote {touched} of {total} files importing ../index')
    if unresolved:
        print(f'  {len(unresolved)} symbols left on the barrel (self-defined or unresolved):')
        for u in unresolved[:10]:
            print(f'    {u}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
