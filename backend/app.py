#!/usr/bin/env python3
"""jobfeed backend - polls job sites and pushes them to Convex.

This process owns no UI and, since the move to Convex, almost no API. The
board reads listings from Convex over a live subscription; what is left here
is the scraper, which cannot be hosted because Naukri and Indeed need a real
Chrome driven by Playwright.

Two endpoints remain, both for this machine only:
    GET  /api/health   liveness, for the systemd unit
    POST /api/poll     the board's Refresh button, asking for a scrape now

Everything else the board used to POST here - marks, notes, stages - is a
Convex mutation now, scoped to the signed-in account. Those handlers were
removed rather than left running: they wrote per-user state into a database
that no longer backs any board, over an endpoint with no authentication.

    python3 app.py            # -> http://127.0.0.1:8765
"""
import json
import os
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

import convex_push
import sources
from store import Store

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG = json.load(open(os.path.join(HERE, "config.json")))
DB = Store(os.path.join(HERE, "jobfeed.db"))

_polling = threading.Lock()
_state = {"last_poll": 0, "running": False}


def poll_once():
    """Run every enabled source. One bad source never stops the others."""
    if not _polling.acquire(blocking=False):
        return {"skipped": "a poll is already running"}
    _state["running"] = True
    result = {}
    try:
        for name, cfg in CONFIG["sources"].items():
            if not cfg.get("enabled", True):
                continue
            try:
                # merge the global filters in: Indeed can only filter at the URL
                merged = {**CONFIG.get("filters", {}), **cfg}
                if name == "indeed":
                    # reading experience costs a page load each, so tell the
                    # adapter which listings we already have it for
                    merged["known_uids"] = DB.uids_with_exp("indeed")
                    merged["pending"] = DB.unchecked(
                        "indeed", limit=merged.get("max_desc_fetch", 30),
                        max_age_days=merged.get("max_age_days"))
                rows = sources.ADAPTERS[name](merged)
                added = DB.add(rows)
                DB.log(name, len(rows), added)
                result[name] = {"found": len(rows), "added": added}
                if not rows:
                    DB.log(name, 0, 0, "no rows parsed - the site layout may have changed")
            except Exception as e:
                msg = f"{type(e).__name__}: {e}"
                DB.log(name, 0, 0, msg)
                result[name] = {"error": msg}
                traceback.print_exc()
        _state["last_poll"] = time.time()
    finally:
        _state["running"] = False
        _polling.release()
    # Outside the finally: the push is not part of scraping, and a Convex
    # outage must not leave the poll lock held or the running flag stuck.
    result["_convex"] = convex_push.push(DB, CONFIG)
    print(f"[poll] {json.dumps(result)}", flush=True)
    return result


def poller():
    while True:
        try:
            poll_once()
        except Exception:
            traceback.print_exc()
        time.sleep(max(60, CONFIG.get("poll_minutes", 15) * 60))


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass                                   # keep the console for poll output

    def _send(self, code, body, ctype="application/json"):
        if not isinstance(body, bytes):
            body = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        # the feed changes under the user; never cache
        self.send_header("Cache-Control", "no-store")
        # the frontend is a separate Next.js origin. In normal use its
        # rewrites proxy same-origin, so this never matters -- it's a
        # fallback for hitting the API directly while developing.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(204, b"", "text/plain")

    def do_GET(self):
        u = urlsplit(self.path)
        path, q = u.path, parse_qs(u.query)
        if path == "/" or path == "/api/health":
            return self._send(200, {
                "service": "jobfeed-backend", "ok": True,
                "last_poll": _state["last_poll"], "running": _state["running"],
            })
        return self._send(404, {"error": "not found"})

    def do_POST(self):
        path = self.path.split("?")[0]
        if path == "/api/poll":
            threading.Thread(target=poll_once, daemon=True).start()
            return self._send(202, {"started": True})
        return self._send(404, {"error": "not found"})


if __name__ == "__main__":
    # Push what is already on disk before the first poll, so a fresh Convex
    # deployment has a populated board immediately rather than after a
    # scrape cycle.
    print(f"[convex] {json.dumps(convex_push.push(DB, CONFIG))}", flush=True)
    threading.Thread(target=poller, daemon=True).start()
    port = CONFIG.get("port", 8765)
    print(f"jobfeed -> http://127.0.0.1:{port}  (polling every "
          f"{CONFIG.get('poll_minutes', 15)} min)", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
