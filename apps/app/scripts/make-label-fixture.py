#!/usr/bin/env python3
"""
Build the "roman-numeral novel" from the acceptance tests in
docs/specs/PDF_PAGE_STRUCTURE_BRIEF.md.

The brief asks for two things from the same book: the divider, the
sticky indicator and the Full-view counter all showing "Page 15 · PDF
23", and Go to page "xii" landing on the right page. Those only hold
together if the front matter runs i..xii (12 pages, so "xii" is PDF 12)
AND the body's printed numbering starts at 5 (so printed 15 is PDF 23).
A book whose body started at 1 would put printed 15 on PDF 27. The
/PageLabels tree below encodes exactly that, which is what makes the
acceptance numbers literally checkable rather than approximately right.

Written by hand rather than with a library because the point of the
fixture IS the /PageLabels catalog entry, and that is the part PDF
writers tend not to expose.

Each page also carries a running header ("A Novel" plus the printed
number) so the same file exercises the running-header stripping.
"""
import io
import sys

PAGES = 30
FRONT_MATTER = 12       # i .. xii
BODY_START_LABEL = 5    # so printed 15 lands on PDF 23

ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii']


def printed_label(page_number: int) -> str:
    """page_number is 1-based PDF page."""
    if page_number <= FRONT_MATTER:
        return ROMAN[page_number - 1]
    return str(BODY_START_LABEL + (page_number - FRONT_MATTER - 1))


def esc(s: str) -> str:
    return s.replace('\\', r'\\').replace('(', r'\(').replace(')', r'\)')


def content_stream(page_number: int) -> bytes:
    label = printed_label(page_number)
    # Running header: title + printed number on one visual line, which
    # is the shape that defeats exact-match header detection.
    header = f'A Novel    {label}'
    body = [
        f'This is the body of PDF page {page_number}, printed as {label}.',
        'It carries enough prose to look like a real page of a novel,',
        'and it differs on every page so that only the header repeats.',
    ]
    if page_number == 23:
        # The page the acceptance test reads.
        body.append('ACCEPTANCE MARKER: this sheet is PDF 23 and prints 15.')
    lines = [b'BT', b'/F1 11 Tf', b'72 760 Td', f'({esc(header)}) Tj'.encode()]
    y = 720
    for line in body:
        lines.append(b'ET')
        lines.append(b'BT')
        lines.append(b'/F1 11 Tf')
        lines.append(f'72 {y} Td'.encode())
        lines.append(f'({esc(line)}) Tj'.encode())
        y -= 18
    lines.append(b'ET')
    return b'\n'.join(lines)


def build() -> bytes:
    objects: list[bytes] = []

    def add(body: bytes) -> int:
        objects.append(body)
        return len(objects)  # 1-based object number

    # Reserve 1=Catalog, 2=Pages so kids can reference page objects.
    objects.append(b'')  # 1 catalog, filled later
    objects.append(b'')  # 2 pages, filled later
    font_num = add(b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

    page_nums: list[int] = []
    for i in range(1, PAGES + 1):
        stream = content_stream(i)
        content_num = add(
            b'<< /Length ' + str(len(stream)).encode() + b' >>\nstream\n'
            + stream + b'\nendstream'
        )
        page_num = add(
            b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
            b'/Resources << /Font << /F1 ' + str(font_num).encode() + b' 0 R >> >> '
            b'/Contents ' + str(content_num).encode() + b' 0 R >>'
        )
        page_nums.append(page_num)

    kids = b' '.join(str(n).encode() + b' 0 R' for n in page_nums)
    objects[1] = (
        b'<< /Type /Pages /Count ' + str(PAGES).encode()
        + b' /Kids [' + kids + b'] >>'
    )

    # The whole point of the fixture: a /PageLabels number tree.
    #   index 0  -> lowercase roman, starting at 1   (i, ii, ... xii)
    #   index 12 -> decimal, starting at 5           (5, 6, ... )
    page_labels = (
        b'<< /Nums [0 << /S /r >> '
        + str(FRONT_MATTER).encode()
        + b' << /S /D /St ' + str(BODY_START_LABEL).encode() + b' >>] >>'
    )
    objects[0] = (
        b'<< /Type /Catalog /Pages 2 0 R /PageLabels ' + page_labels + b' >>'
    )

    out = io.BytesIO()
    out.write(b'%PDF-1.7\n%\xe2\xe3\xcf\xd3\n')
    offsets = [0]
    for i, body in enumerate(objects, start=1):
        offsets.append(out.tell())
        out.write(str(i).encode() + b' 0 obj\n' + body + b'\nendobj\n')
    xref_pos = out.tell()
    out.write(b'xref\n0 ' + str(len(objects) + 1).encode() + b'\n')
    out.write(b'0000000000 65535 f \n')
    for off in offsets[1:]:
        out.write(f'{off:010d} 00000 n \n'.encode())
    out.write(
        b'trailer\n<< /Size ' + str(len(objects) + 1).encode()
        + b' /Root 1 0 R >>\nstartxref\n' + str(xref_pos).encode() + b'\n%%EOF\n'
    )
    return out.getvalue()


if __name__ == '__main__':
    dest = sys.argv[1] if len(sys.argv) > 1 else 'roman-novel.pdf'
    data = build()
    io.open(dest, 'wb').write(data)
    print(f'wrote {dest}: {len(data)} bytes, {PAGES} pages')
    print(f'  PDF 12 prints {printed_label(12)!r}  (Go to page "xii")')
    print(f'  PDF 23 prints {printed_label(23)!r}  (expect "Page 15 · PDF 23")')
