#!/usr/bin/env python3
"""It Looks Like You're Trying to Hold a Seance - tiny stdlib-only server.

Serves ./web and proxies a whitelist of Ollama endpoints (avoids CORS).
Usage: python server.py [--port 8000] [--host 127.0.0.1]
Env:   OLLAMA_HOST (default http://127.0.0.1:11434)
"""
import argparse
import http.client
import json
import os
import posixpath
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")
_host = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")
if "://" not in _host:
    _host = "http://" + _host
OLLAMA = urllib.parse.urlparse(_host)
PROXY_GET = {"/api/tags"}
PROXY_POST = {"/api/chat", "/api/generate"}
MAX_BODY = 4 * 1024 * 1024


class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.0"  # streamed bodies are close-delimited

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def translate_path(self, path):
        path = posixpath.normpath(urllib.parse.unquote(path.split("?", 1)[0].split("#", 1)[0]))
        parts = [p for p in path.split("/") if p and p not in (".", "..")]
        return os.path.join(ROOT, *parts)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json_error(self, code, msg):
        data = json.dumps({"error": msg}).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _proxy(self, method, body=None):
        path = self.path.split("?", 1)[0]
        conn = http.client.HTTPConnection(OLLAMA.hostname, OLLAMA.port or 11434, timeout=600)
        try:
            headers = {"Content-Type": "application/json"} if body is not None else {}
            conn.request(method, path, body=body, headers=headers)
            resp = conn.getresponse()
        except OSError as e:
            conn.close()
            return self._json_error(502, "Ollama unreachable: %s" % e)
        try:
            self.send_response(resp.status)
            self.send_header("Content-Type", resp.getheader("Content-Type", "application/json"))
            self.end_headers()
            while True:
                chunk = resp.read1(4096)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            conn.close()

    def do_GET(self):
        if self.path.split("?", 1)[0] in PROXY_GET:
            return self._proxy("GET")
        super().do_GET()

    def do_POST(self):
        if self.path.split("?", 1)[0] not in PROXY_POST:
            return self._json_error(404, "not found")
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = -1
        if length < 0 or length > MAX_BODY:
            return self._json_error(413, "bad body size")
        self._proxy("POST", self.rfile.read(length))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    a = ap.parse_args()
    srv = ThreadingHTTPServer((a.host, a.port), Handler)
    print("The parlour is open: http://%s:%d  (Ollama at %s)" % (a.host, a.port, OLLAMA.geturl()))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nThe candle goes out.")


if __name__ == "__main__":
    main()
