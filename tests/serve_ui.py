"""Serve the local UI fixture; no credentials or real network calls are used."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os

os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/anime/'):
            self.path = '/tests/ui.html'
        elif self.path.endswith('/ui-mock.js'):
            self.path = '/tests/ui-mock.js'
        elif self.path.endswith('/extension/content.js'):
            self.path = '/extension/content.js'
        super().do_GET()

ThreadingHTTPServer(('127.0.0.1', 8765), Handler).serve_forever()
