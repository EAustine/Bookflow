"""Convert one exported illustration SVG into the project's RN component form.

    python3 scripts/svg-to-illustration.py apps/app/assets/illustrations/<name>.svg

Prints the viewBox, the `react-native-svg` imports the drawing needs,
and the element list to paste into a component under
`apps/app/src/components/illustrations/`. There is no SVG transformer
in this project, so an illustration cannot be imported as a component
and the paths have to live in TSX.

Deterministic on purpose: the path data is copied verbatim, so the only
judgement in the output is the hex-to-token mapping below, and that is a
lookup rather than an opinion.
"""
import re, sys

TOKEN = {
    '#0E2A21': 'C.forest[900]',
    '#2D5A3F': 'C.forest[600]',
    '#4A7C59': 'C.forest[400]',
    '#DAE6DC': 'C.forest[100]',
    '#D4A574': 'C.amber[500]',
    '#EFD9B5': 'C.amber[200]',
    '#FAF7F2': 'C.cream[50]',
}
ATTR = {
    'stroke-width': 'strokeWidth',
    'stroke-linejoin': 'strokeLinejoin',
    'stroke-linecap': 'strokeLinecap',
    'fill-rule': 'fillRule',
    'opacity': 'opacity',
}

def colour(v):
    if v.lower() == 'none':
        return '"none"'
    key = v.upper()
    if key not in TOKEN:
        raise SystemExit(f'unmapped colour {v!r}')
    return '{' + TOKEN[key] + '}'

def render(tag, attrs):
    out = []
    a = dict(re.findall(r'([a-zA-Z-]+)="([^"]*)"', attrs))
    for k in ('d', 'transform'):
        if k in a:
            out.append(f'{k}="{a[k]}"')
    for k in ('cx', 'cy', 'r'):
        if k in a:
            out.append(f'{k}={{{a[k]}}}')
    for k in ('fill', 'stroke'):
        if k in a:
            out.append(f'{k}={colour(a[k])}')
    for k, js in ATTR.items():
        if k in a:
            v = a[k]
            out.append(f'{js}={{{v}}}' if re.fullmatch(r'[\d.]+', v) else f'{js}="{v}"')
    el = {'path': 'Path', 'circle': 'Circle', 'g': 'G'}[tag]
    return el, ' '.join(out)

def convert(svg_path):
    s = open(svg_path).read()
    vb = re.search(r'viewBox="([^"]*)"', s).group(1)
    body, used, depth = [], set(), 3
    for m in re.finditer(r'<(/?)(svg|g|circle|path)\b([^>]*?)(/?)>', s):
        closing, tag, attrs, selfclose = m.groups()
        if tag == 'svg':
            continue
        if closing:
            depth -= 1
            body.append('  ' * depth + '</G>')
            continue
        el, rendered = render(tag, attrs)
        used.add(el)
        if tag == 'g' and not selfclose:
            body.append('  ' * depth + f'<{el} {rendered}>'.replace(' >', '>'))
            depth += 1
        else:
            body.append('  ' * depth + f'<{el} {rendered} />')
    return vb, body, used

if __name__ == '__main__':
    vb, body, used = convert(sys.argv[1])
    print(vb)
    print('IMPORTS:', ', '.join(sorted(used)))
    print('\n'.join(body))
