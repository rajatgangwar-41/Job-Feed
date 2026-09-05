"""Push the curated listing pool into Convex.

The scraper cannot move into Convex -- Naukri and Indeed need a real,
warmed Chrome driven by Playwright -- so it stays here and Convex becomes
the place the data lands. This module is the one-way door: local SQLite is
the scraper's working set, Convex is what every signed-in board reads.

What crosses the wire is the *curated* feed, not the raw table: Store.feed()
applies the config's title/tech/company regexes and the per-source cap, and
that filtering logic is the accumulated knowledge of which listings are
actually worth showing. Age and experience are deliberately left wide here,
because those two are the sidebar's to choose per request.

Nothing about a person crosses the wire. Saved/applied/notes/stage in the
local database are leftovers from when this was a single-user tool; per-user
state now belongs to Convex, keyed by Clerk id, and is never written here.

Config, both from the environment (see backend/.env):
    CONVEX_URL      https://<deployment>.convex.cloud  (or .convex.site)
    POLLER_SECRET   the same value as `npx convex env set POLLER_SECRET ...`
"""
import json
import os
import time
import urllib.error
import urllib.request

# Convex serves queries from .convex.cloud but HTTP actions from .convex.site.
# Accepting either and normalising means one URL in one place, instead of a
# second near-identical variable that is easy to set to the wrong host.
_ACTION_HOST = ".convex.site"
BATCH = 200
TIMEOUT = 30


def _load_env(path=None):
    """Minimal KEY=VALUE reader, so this needs no dependency to be added."""
    path = path or os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.exists(path):
        return
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def _endpoint():
    _load_env()
    url = (os.environ.get("CONVEX_URL") or "").strip().rstrip("/")
    secret = os.environ.get("POLLER_SECRET") or ""
    if not url or not secret:
        return None, None
    if url.endswith(".convex.cloud"):
        url = url[: -len(".convex.cloud")] + _ACTION_HOST
    return url + "/push", secret


def _post(endpoint, secret, payload):
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        endpoint, data=body, method="POST",
        headers={"Content-Type": "application/json", "x-poller-secret": secret})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.load(r)


def push(store, config, running=False):
    """Send the curated pool plus poller telemetry. Returns a short summary.

    Never raises: a Convex outage must not take the scraper down with it, and
    the next poll will push the same rows again anyway (the ingest mutation
    upserts on uid, so re-sending is free).
    """
    endpoint, secret = _endpoint()
    if not endpoint:
        return {"skipped": "CONVEX_URL or POLLER_SECRET not set"}

    filters = config.get("filters", {})
    rows = store.feed(
        include_closed=True,                 # closed/applied are per-user now
        per_source=filters.get("per_source", 200),
        max_age_days=None,                   # the sidebar's call, not ours
        max_exp_years=None,
        exclude_titles=(list(filters.get("exclude_titles", []))
                        + list(filters.get("exclude_nontech", []))),
        tech_terms=filters.get("tech_terms", ()),
        require_checked=filters.get("require_checked", ()),
        exclude_companies=filters.get("exclude_companies", ()),
        jobs_first=filters.get("jobs_first", False))

    keep = ("uid", "source", "title", "company", "location", "pay", "posted",
            "posted_at", "exp_min", "url", "tags", "desc_checked", "first_seen")
    jobs = [{k: r.get(k) for k in keep} for r in rows]

    status = store.status()
    meta = {
        "runs": [{"source": r["source"], "ts": r["ts"], "found": r.get("found") or 0,
                  "added": r.get("added") or 0, "error": r.get("error")}
                 for r in status.get("runs", [])],
        "last_poll": time.time(),
        "running": running,
        "poll_minutes": config.get("poll_minutes", 15),
        "filters": filters,
    }

    sent = 0
    try:
        # Batched because one mutation carries the whole list, and a few
        # thousand upserts in a single transaction is how you find Convex's
        # limits the hard way. The metadata rides on the first batch so a
        # failure part-way through still leaves the run's status recorded.
        for i in range(0, len(jobs), BATCH):
            chunk = jobs[i:i + BATCH]
            payload = {"jobs": chunk}
            if i == 0:
                payload.update(meta)
            _post(endpoint, secret, payload)
            sent += len(chunk)
        if not jobs:
            _post(endpoint, secret, {"jobs": [], **meta})
        return {"pushed": sent}
    except urllib.error.HTTPError as e:
        detail = e.read()[:200].decode(errors="replace")
        return {"error": f"convex {e.code}: {detail}", "pushed": sent}
    except Exception as e:
        return {"error": f"{type(e).__name__}: {e}", "pushed": sent}
