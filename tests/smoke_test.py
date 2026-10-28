"""Smoke test: fake Ollama + real server.py; checks static serving, tags, forge JSON, streaming."""
import http.server, json, os, subprocess, sys, threading, time, urllib.error, urllib.request

class Fake(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        d = json.dumps({"models": [{"name": "qwen3:8b"}]}).encode()
        self.send_response(200); self.send_header("Content-Length", str(len(d))); self.end_headers(); self.wfile.write(d)
    def do_POST(self):
        req = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.send_response(200); self.end_headers()
        if req.get("stream"):
            for w in ["The ", "veil ", "is ", "cloudy."]:
                self.wfile.write((json.dumps({"message": {"content": w}, "done": False}) + "\n").encode()); self.wfile.flush()
            self.wfile.write(b'{"done":true}\n')
        else:
            self.wfile.write(json.dumps({"message": {"content": json.dumps({"name": "X"})}}).encode())

fake = http.server.ThreadingHTTPServer(("127.0.0.1", 11555), Fake)
threading.Thread(target=fake.serve_forever, daemon=True).start()
env = dict(os.environ, OLLAMA_HOST="127.0.0.1:11555")
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
p = subprocess.Popen([sys.executable, "server.py", "--port", "8123"], env=env, cwd=root)
time.sleep(1.5)
try:
    g = lambda u: urllib.request.urlopen("http://127.0.0.1:8123" + u).read()
    assert "Séance".encode() in g("/")
    assert b"qwen3" in g("/api/tags")
    for f in ("app.js", "clippy.js", "spirits.js", "style.css"): g("/" + f)
    def post(body):
        r = urllib.request.Request("http://127.0.0.1:8123/api/chat", json.dumps(body).encode(), {"Content-Type": "application/json"})
        return urllib.request.urlopen(r).read().decode()
    assert post({"stream": True}).count("\n") == 5
    assert "name" in post({"stream": False})
    for bad in ("/api/delete", "/../server.py"):
        try: g(bad); raise SystemExit("should have failed: " + bad)
        except urllib.error.HTTPError as e: assert e.code == 404, e.code
    print("SMOKE OK")
finally:
    p.terminate()
