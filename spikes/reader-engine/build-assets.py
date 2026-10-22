#!/usr/bin/env python3
"""
Build the spike's sample assets from the real EPUB.

Produces:
  assets/epub/                 the EPUB unzipped, served as plain files
  assets/epub-manifest.json    spine order
  assets/canonical-document.json
      the §7.2 shape: pages -> blocks -> sentences -> words, every one
      with a stable id. Built from the same book so the text-mode and
      EPUB-mode numbers are comparable.

Run from spikes/reader-engine/:  python3 -I build-assets.py
"""
import io
import json
import os
import re
import sys
import zipfile
from html.parser import HTMLParser

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, 'assets')
EPUB = os.path.join(ASSETS, 'sample.epub')
OUT_EPUB = os.path.join(ASSETS, 'epub')

WORDS_PER_PAGE = 300  # roughly a trade paperback page


class Text(HTMLParser):
    """Strip tags, keep paragraph boundaries."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.paras = []
        self._buf = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self._skip += 1
        if tag in ('p', 'div', 'h1', 'h2', 'h3', 'br'):
            self._flush()

    def handle_endtag(self, tag):
        if tag in ('script', 'style') and self._skip:
            self._skip -= 1
        if tag in ('p', 'div', 'h1', 'h2', 'h3'):
            self._flush()

    def handle_data(self, data):
        if not self._skip:
            self._buf.append(data)

    def _flush(self):
        s = re.sub(r'\s+', ' ', ''.join(self._buf)).strip()
        if s:
            self.paras.append(s)
        self._buf = []

    def close(self):
        super().close()
        self._flush()


def unzip():
    os.makedirs(OUT_EPUB, exist_ok=True)
    with zipfile.ZipFile(EPUB) as z:
        names = z.namelist()
        for n in names:
            if n.endswith('/'):
                continue
            # zip entries are untrusted input; refuse anything escaping the dir
            dest = os.path.normpath(os.path.join(OUT_EPUB, n))
            if not dest.startswith(os.path.abspath(OUT_EPUB) + os.sep) and \
               not dest.startswith(OUT_EPUB + os.sep):
                print('  skipped unsafe entry:', n)
                continue
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with z.open(n) as src, io.open(dest, 'wb') as out:
                out.write(src.read())
        return names


def spine_from_opf(names):
    opf = next((n for n in names if n.endswith('.opf')), None)
    if not opf:
        return []
    raw = io.open(os.path.join(OUT_EPUB, opf), encoding='utf-8', errors='replace').read()
    base = os.path.dirname(opf)
    # Attribute order is not fixed — this EPUB writes href before id, which
    # an order-dependent pattern silently misses, yielding an empty spine.
    ids = {}
    for tag in re.findall(r'<item\b[^>]*?/?>', raw):
        i = re.search(r'\bid="([^"]+)"', tag)
        h = re.search(r'\bhref="([^"]+)"', tag)
        if i and h:
            ids[i.group(1)] = h.group(1)
    order = re.findall(r'<itemref\b[^>]*idref="([^"]+)"', raw)
    out = []
    for i in order:
        href = ids.get(i)
        if href and href.endswith(('.xhtml', '.html', '.htm')):
            out.append(os.path.join(base, href) if base else href)
    return out


def canonical(spine):
    words, page_i, pages = [], 0, []
    blocks_buf = []

    def emit_page():
        nonlocal blocks_buf, page_i
        if not blocks_buf:
            return
        pages.append({'id': f'p{page_i}', 'index': page_i, 'blocks': blocks_buf})
        blocks_buf = []
        page_i += 1

    count_on_page = 0
    for href in spine:
        path = os.path.join(OUT_EPUB, href)
        if not os.path.exists(path):
            continue
        t = Text()
        t.feed(io.open(path, encoding='utf-8', errors='replace').read())
        t.close()
        for para in t.paras:
            toks = para.split(' ')
            if not toks:
                continue
            bi = len(blocks_buf)
            blocks_buf.append({
                'id': f'p{page_i}b{bi}',
                'words': [{'id': f'p{page_i}b{bi}w{j}', 't': w}
                          for j, w in enumerate(toks)],
            })
            count_on_page += len(toks)
            words.append(len(toks))
            if count_on_page >= WORDS_PER_PAGE:
                emit_page()
                count_on_page = 0
    emit_page()
    return {'version': 1, 'pages': pages, 'wordCount': sum(words)}


def main():
    if not os.path.exists(EPUB):
        sys.exit('assets/sample.epub missing')
    print('unzipping epub…')
    names = unzip()
    spine = spine_from_opf(names)
    print(f'  {len(names)} entries, {len(spine)} spine documents')

    with io.open(os.path.join(ASSETS, 'epub-manifest.json'), 'w', encoding='utf-8') as f:
        json.dump({'spine': spine}, f)

    print('building canonical document…')
    doc = canonical(spine)
    out = os.path.join(ASSETS, 'canonical-document.json')
    with io.open(out, 'w', encoding='utf-8') as f:
        json.dump(doc, f)

    size = os.path.getsize(out)
    print(f'  {len(doc["pages"])} pages, {doc["wordCount"]:,} words, '
          f'{size/1048576:.1f} MB json')


if __name__ == '__main__':
    main()
