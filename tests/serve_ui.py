"""Serve the local UI fixture; no credentials or real network calls are used."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
import sys

os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/tests/options-preview.html':
            html = Path('extension/options.html').read_text().replace('href="options.css"', 'href="/extension/options.css"').replace('src="icon.png"','src="/extension/icon.png"').replace('<script src="options.js"', '<script src="/tests/options-mock.js"></script><script src="/extension/options.js"')
            data = html.encode()
            self.send_response(200); self.send_header('Content-Type','text/html'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data); return
        if self.path.startswith('/anime/'):
            self.path = '/tests/ui.html'
        elif self.path.endswith('/ui-mock.js'):
            self.path = '/tests/ui-mock.js'
        elif self.path.endswith('/extension/content.js'):
            self.path = '/extension/content.js'
        super().do_GET()

ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv)>1 else 8765), Handler).serve_forever()
