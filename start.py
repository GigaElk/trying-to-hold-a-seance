#!/usr/bin/env python3
"""One-command launcher: checks Ollama, pulls a model if needed, starts the server, opens the browser.

Usage: python start.py [--model gemma3:4b] [--port 8000] [--no-browser] [--yes]
"""
import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
PREFERRED = ["gemma3:4b", "qwen3:8b", "llama3.1:8b"]
host = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")
if "://" not in host:
    host = "http://" + host
OLLAMA_URL = host.rstrip("/")


def say(msg):
    print("  " + msg, flush=True)


def find_ollama():
    exe = shutil.which("ollama")
    if exe:
        return exe
    if os.name == "nt":
        p = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "Ollama", "ollama.exe")
        if os.path.exists(p):
            return p
    elif sys.platform == "darwin" and os.path.exists("/Applications/Ollama.app/Contents/Resources/ollama"):
        return "/Applications/Ollama.app/Contents/Resources/ollama"
    return None


def installed_models():
    try:
        with urllib.request.urlopen(OLLAMA_URL + "/api/tags", timeout=3) as r:
            return [m["name"] for m in json.load(r).get("models", [])]
    except Exception:
        return None  # unreachable


def has(models, name):
    return any(m == name or m == name + ":latest" for m in models)


def port_free(port):
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", port)) != 0


def main():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")
        except Exception:
            pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", help="model to use (pulled if missing)")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--yes", "-y", action="store_true", help="don't ask before pulling a model")
    a = ap.parse_args()

    print("\nIt Looks Like You're Trying to Hold a Séance\n")
    ollama = find_ollama()
    if not ollama:
        say("Ollama is not installed. Get it from https://ollama.com/download, then run this again.")
        return 1
    say("Found Ollama: " + ollama)

    started = None
    models = installed_models()
    if models is None:
        say("Ollama is not running; starting it…")
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        started = subprocess.Popen([ollama, "serve"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                   creationflags=flags)
        for _ in range(40):
            time.sleep(0.5)
            models = installed_models()
            if models is not None:
                break
        if models is None:
            say("Ollama did not come up. Try running `ollama serve` yourself and check for errors.")
            started.terminate()
            return 1
    say("Ollama is listening.")

    wanted = a.model
    if not wanted:
        wanted = next((m for m in PREFERRED if has(models, m)), None)
    if wanted and has(models, wanted):
        say("Using model: " + wanted)
    else:
        if not wanted:
            if models:
                wanted = models[0]
                say("None of the usual models found; using what you have: " + wanted)
            else:
                wanted = "gemma3:4b"
        if not has(models, wanted):
            if not a.yes and sys.stdin.isatty():
                ans = input("  Model '%s' is not installed. Pull it now? (a few GB) [Y/n] " % wanted).strip().lower()
                if ans in ("n", "no"):
                    say("Okay. Pull one yourself (e.g. `ollama pull gemma3:4b`) and run this again.")
                    return 1
            say("Pulling %s … (this can take a while)" % wanted)
            if subprocess.call([ollama, "pull", wanted]) != 0:
                say("Pull failed.")
                return 1

    port = a.port
    while not port_free(port) and port < a.port + 20:
        port += 1
    srv = subprocess.Popen([sys.executable, os.path.join(HERE, "server.py"), "--port", str(port)], cwd=HERE)
    url = "http://127.0.0.1:%d/" % port
    for _ in range(40):
        if srv.poll() is not None:
            say("The server exited unexpectedly.")
            return 1
        if not port_free(port):
            break
        time.sleep(0.25)
    if a.model:
        url += "?model=" + urllib.parse.quote(a.model)
    say("The parlour is open: " + url + "   (Ctrl+C to close)")
    if not a.no_browser:
        webbrowser.open(url)
    try:
        srv.wait()
    except KeyboardInterrupt:
        pass
    finally:
        srv.terminate()
        if started:
            started.terminate()
    return 0


if __name__ == "__main__":
    sys.exit(main())
