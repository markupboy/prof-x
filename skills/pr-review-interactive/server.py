#!/usr/bin/env python3
"""Local server for /pr-review-interactive.

Serves the static review app from this directory and a tiny JSON API over a
session directory:

  GET  /              -> index.html
  GET  /app.js, /styles.css, /renderer.js
  GET  /api/state     -> <session>/review.json   (ETag = mtime_ns; 304 on match)
  GET  /api/patches   -> <session>/patches.json
  POST /api/message   -> append one JSON line to <session>/inbox.jsonl, reply {"id": N}

Stdlib only. Binds 127.0.0.1 only. Exits 2 when the port cannot be bound so the
caller can try the next one. Writes <session>/port and <session>/server.pid.
"""
import argparse
import json
import os
import sys
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock

APP_DIR = Path(__file__).resolve().parent
STATIC = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/app.js": ("app.js", "application/javascript; charset=utf-8"),
    "/renderer.js": ("renderer.js", "application/javascript; charset=utf-8"),
    "/styles.css": ("styles.css", "text/css; charset=utf-8"),
}
MESSAGE_TYPES = {
    "verify", "reframe", "ask", "set_status", "set_severity", "queue", "unqueue",
    "post_one", "submit_review", "export", "end", "note",
}
MAX_BODY = 1_000_000

_id_lock = Lock()


def _next_id(session: Path) -> int:
    counter = session / "next_id"
    with _id_lock:
        try:
            n = int(counter.read_text().strip() or "0")
        except (FileNotFoundError, ValueError):
            n = 0
        n += 1
        tmp = counter.with_suffix(".tmp")
        tmp.write_text(str(n))
        os.replace(tmp, counter)
        return n


def make_handler(session: Path):
    class Handler(BaseHTTPRequestHandler):
        server_version = "pr-review-interactive/1"

        # Quiet by default; only errors reach the log.
        def log_message(self, fmt, *args):
            pass

        def log_error(self, fmt, *args):
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

        def _send(self, status, body: bytes, ctype="application/json; charset=utf-8", extra=None):
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def _json(self, status, obj, extra=None):
            self._send(status, json.dumps(obj).encode("utf-8"), extra=extra)

        def do_GET(self):
            path = self.path.split("?", 1)[0]
            if path == "/favicon.ico":
                self.send_response(HTTPStatus.NO_CONTENT)
                self.end_headers()
                return
            if path in STATIC:
                name, ctype = STATIC[path]
                try:
                    body = (APP_DIR / name).read_bytes()
                except FileNotFoundError:
                    return self._json(HTTPStatus.NOT_FOUND, {"error": "missing " + name})
                return self._send(HTTPStatus.OK, body, ctype)

            if path == "/api/state":
                f = session / "review.json"
                try:
                    st = f.stat()
                except FileNotFoundError:
                    return self._json(HTTPStatus.NOT_FOUND, {"error": "review.json not written yet"})
                etag = '"%d-%d"' % (st.st_mtime_ns, st.st_size)
                if self.headers.get("If-None-Match") == etag:
                    self.send_response(HTTPStatus.NOT_MODIFIED)
                    self.send_header("ETag", etag)
                    self.send_header("Cache-Control", "no-store")
                    self.end_headers()
                    return
                # Claude writes atomically (tmp + rename) but re-read after stat in case
                # the file was swapped between the two calls — the ETag stays consistent
                # with the bytes we serve only if we re-stat after reading.
                body = f.read_bytes()
                st = f.stat()
                etag = '"%d-%d"' % (st.st_mtime_ns, st.st_size)
                return self._send(HTTPStatus.OK, body, extra={"ETag": etag})

            if path == "/api/patches":
                f = session / "patches.json"
                try:
                    body = f.read_bytes()
                except FileNotFoundError:
                    body = b"{}"
                return self._send(HTTPStatus.OK, body)

            return self._json(HTTPStatus.NOT_FOUND, {"error": "not found"})

        def do_HEAD(self):
            self.do_GET()

        def do_POST(self):
            path = self.path.split("?", 1)[0]
            if path != "/api/message":
                return self._json(HTTPStatus.NOT_FOUND, {"error": "not found"})
            # CSRF guard: the page is the only legitimate caller. Cross-origin forms
            # cannot send application/json without a preflight (which we never answer),
            # and a browser-sent Origin must be this server's own origin.
            ctype = self.headers.get("Content-Type", "")
            if not ctype.lower().startswith("application/json"):
                return self._json(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, {"error": "Content-Type must be application/json"})
            origin = self.headers.get("Origin")
            if origin and origin not in self.server.allowed_origins:
                return self._json(HTTPStatus.FORBIDDEN, {"error": "cross-origin requests are not allowed"})
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                return self._json(HTTPStatus.BAD_REQUEST, {"error": "bad Content-Length"})
            if length <= 0 or length > MAX_BODY:
                return self._json(HTTPStatus.BAD_REQUEST, {"error": "body must be 1..%d bytes" % MAX_BODY})
            raw = self.rfile.read(length)
            try:
                msg = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                return self._json(HTTPStatus.BAD_REQUEST, {"error": "invalid JSON"})
            if not isinstance(msg, dict) or msg.get("type") not in MESSAGE_TYPES:
                return self._json(HTTPStatus.BAD_REQUEST, {"error": "unknown or missing type",
                                                           "allowed": sorted(MESSAGE_TYPES)})
            msg["id"] = _next_id(session)
            msg["at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
            line = json.dumps(msg, ensure_ascii=False, separators=(",", ":"))
            # Single write per line so `tail -F` never sees a partial JSON object.
            with open(session / "inbox.jsonl", "a", encoding="utf-8") as fh:
                fh.write(line + "\n")
                fh.flush()
                os.fsync(fh.fileno())
            return self._json(HTTPStatus.OK, {"id": msg["id"]})

    return Handler


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--session", required=True, help="session directory (review.json, patches.json, inbox.jsonl)")
    ap.add_argument("--port", type=int, default=8433)
    args = ap.parse_args()

    session = Path(args.session).resolve()
    session.mkdir(parents=True, exist_ok=True)
    (session / "inbox.jsonl").touch(exist_ok=True)  # so `tail -F` has a file from the start

    try:
        httpd = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(session))
    except OSError as e:
        sys.stderr.write("cannot bind 127.0.0.1:%d: %s\n" % (args.port, e))
        sys.exit(2)
    httpd.daemon_threads = True
    httpd.allowed_origins = {"http://127.0.0.1:%d" % args.port, "http://localhost:%d" % args.port}

    (session / "port").write_text(str(args.port))
    (session / "server.pid").write_text(str(os.getpid()))
    sys.stderr.write("pr-review-interactive serving %s on http://127.0.0.1:%d/\n" % (session, args.port))
    sys.stderr.flush()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
