#!/usr/bin/env python3
"""
Move one feature into src/features/<name>/ and rewrite every import.

usage: python3 -I scripts/move-feature.py <name> <screens...> -- <libs...>

Throwaway tooling for M3's decomposition. Doing eight of these by hand
is how a typo'd import path gets committed; `tsc` would catch it, but
only after the fact and with a 1,000-line diff to search.

Two rules learned from the first move (billing):

  - The barrel uses `export *`, not named exports. A named export drops
    types, and the first attempt broke on `BuyCreditsSheetRef`.
  - Modules inside src/lib import each other RELATIVELY (`./revenuecat`),
    so rewriting only the `~/lib/x` form leaves those behind. Both forms
    are rewritten.
"""
import io
import os
import subprocess
import sys


def git_mv(src: str, dst: str) -> bool:
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    r = subprocess.run(['git', 'mv', src, dst], capture_output=True, text=True)
    if r.returncode != 0:
        print(f'  !! {src}: {r.stderr.strip()}')
        return False
    return True


def main() -> int:
    args = sys.argv[1:]
    if '--' in args:
        split = args.index('--')
        name, screens, libs = args[0], args[1:split], args[split + 1:]
    else:
        name, screens, libs = args[0], args[1:], []

    feature = f'src/features/{name}'
    moved_screens, moved_libs = [], []

    for s in screens:
        if git_mv(f'src/screens/{s}.tsx', f'{feature}/screens/{s}.tsx'):
            moved_screens.append(s)
    for l in libs:
        for ext in ('.ts', '.tsx'):
            if os.path.exists(f'src/lib/{l}{ext}'):
                if git_mv(f'src/lib/{l}{ext}', f'{feature}/api/{l}{ext}'):
                    moved_libs.append(l)
                break

    # Barrel. `export *` carries types; named exports do not.
    lines = [
        '/**',
        f' * {name.capitalize()} feature.',
        ' *',
        ' * §4 rule 1: other features import from THIS file, never from the',
        ' * paths inside. The ESLint boundary added in M1 enforces it.',
        ' */',
    ]
    for s in moved_screens:
        lines.append(f"export * from './screens/{s}';")
    for l in moved_libs:
        lines.append(f"export * from './api/{l}';")
    io.open(f'{feature}/index.ts', 'w', encoding='utf-8').write('\n'.join(lines) + '\n')

    # Rewrite imports repo-wide.
    mapping = {}
    for s in moved_screens:
        mapping[f'~/screens/{s}'] = f'~/features/{name}'
    for l in moved_libs:
        mapping[f'~/lib/{l}'] = f'~/features/{name}'
        mapping[f'./{l}'] = f'~/features/{name}'      # lib-to-lib relative

    changed = 0
    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs
                   if d not in ('node_modules', 'android', 'ios', '.expo', 'dist')]
        for f in files:
            if not f.endswith(('.ts', '.tsx')):
                continue
            p = os.path.join(root, f)
            s = io.open(p, encoding='utf-8').read()
            orig = s
            for old, new in mapping.items():
                # Only rewrite a relative './x' when the file is in src/lib,
                # or every feature's own './screens/x' would be clobbered.
                if old.startswith('./') and '/lib/' not in p:
                    continue
                # Both quote styles: prettier reformatted one file to
                # double quotes, and a single-quote-only rewrite left a
                # stale import that only tsc caught.
                s = s.replace(f"'{old}'", f"'{new}'")
                s = s.replace(f'"{old}"', f'"{new}"')
            # Inside the feature itself, point at the barrel relatively.
            if f'/features/{name}/' in p:
                s = s.replace(f"'~/features/{name}'", "'../index'")
                s = s.replace(f'"~/features/{name}"', "'../index'")
            if s != orig:
                io.open(p, 'w', encoding='utf-8').write(s)
                changed += 1

    # A moved lib module keeps relative imports to siblings that did NOT
    # move; those now resolve to nothing. Point them back at src/lib.
    import re
    for root, _, files in os.walk(feature):
        for f in files:
            if not f.endswith(('.ts', '.tsx')):
                continue
            p = os.path.join(root, f)
            s = io.open(p, encoding='utf-8').read()
            orig = s
            for m in set(re.findall(r"from ['\"]\./([A-Za-z0-9_-]+)['\"]", s)):
                if m == 'index':
                    continue
                if any(os.path.exists(os.path.join(root, m + e)) for e in ('.ts', '.tsx')):
                    continue
                if any(os.path.exists(f'src/lib/{m}{e}') for e in ('.ts', '.tsx')):
                    s = s.replace(f"'./{m}'", f"'~/lib/{m}'")
                    s = s.replace(f'"./{m}"', f'"~/lib/{m}"')
            if s != orig:
                io.open(p, 'w', encoding='utf-8').write(s)

    print(f'{name}: {len(moved_screens)} screens, {len(moved_libs)} lib, '
          f'{changed} files rewritten')
    return 0


if __name__ == '__main__':
    sys.exit(main())
