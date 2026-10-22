#!/usr/bin/env python3
"""
Static server for the M0 reader spike, plus a POST sink for metrics.

`python3 -m http.server` cannot take the results back, and scraping them
out of Chrome over the DevTools protocol is more moving parts than this
spike needs. The engine POSTs its metrics here and they land in
results/.

Run from spikes/reader-engine/:  python3 -I serve.py 8100
"""
import io
import json
import os
import sys
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.path.join(HERE, 'results')


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=HERE, **kw)

    def end_headers(self):
        # The engine loads ES modules and a pdf.js worker; both want a
        # sane origin. Also stop the browser caching between runs, or the
        # second measurement of "time to first page" is a lie.
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def do_POST(self):
        if self.path != '/metrics':
            self.send_error(404)
            return
        n = int(self.headers.get('Content-Length', 0))
        raw = self.rfile.read(n)
        os.makedirs(RESULTS, exist_ok=True)
        name = time.strftime('run-%Y%m%d-%H%M%S.json')
        with io.open(os.path.join(RESULTS, name), 'wb') as f:
            f.write(raw)
        try:
            d = json.loads(raw)
            runs = d.get('runs', [])
            sys.stderr.write('[metrics] %s  %d runs\n' % (name, len(runs)))
            for r in runs:
                sys.stderr.write('   %s\n' % json.dumps(r))
        except Exception as e:
            sys.stderr.write('[metrics] %s (unparsed: %s)\n' % (name, e))
        sys.stderr.flush()
        self.send_response(204)
        self.end_headers()

    def log_message(self, fmt, *args):
        # Quiet the per-asset noise; the EPUB alone is 164 images.
        # log_error() routes through here too and passes an HTTPStatus as
        # args[0], so this must not assume a string — doing so throws
        # inside the handler thread on every 404.
        first = str(args[0]) if args else ''
        if '/metrics' in first:
            super().log_message(fmt, *args)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8100
    srv = ThreadingHTTPServer(('0.0.0.0', port), Handler)
    sys.stderr.write('serving %s on 0.0.0.0:%d\n' % (HERE, port))
    sys.stderr.flush()
    srv.serve_forever()
