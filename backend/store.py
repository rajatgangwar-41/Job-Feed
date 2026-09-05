"""SQLite store. One row per listing; dedupe is just the primary key."""
import collections
import re
import sqlite3
import threading
import time

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
  uid        TEXT PRIMARY KEY,
  source     TEXT NOT NULL,
  title      TEXT,
  company    TEXT,
  location   TEXT,
  pay        TEXT,
  posted     TEXT,
  posted_at  REAL,
  exp_min    REAL,
  url        TEXT,
  tags       TEXT,
  first_seen REAL NOT NULL,
  flagged    INTEGER NOT NULL DEFAULT 0,
  closed     INTEGER NOT NULL DEFAULT 0,
  applied    INTEGER NOT NULL DEFAULT 0,
  applied_at REAL,
  opened     INTEGER NOT NULL DEFAULT 0,
  desc_checked INTEGER,
  saved      INTEGER NOT NULL DEFAULT 0,
  notes      TEXT
);
CREATE INDEX IF NOT EXISTS idx_feed ON jobs(closed, posted_at DESC);

CREATE TABLE IF NOT EXISTS runs (
  source TEXT PRIMARY KEY,
  ts     REAL NOT NULL,
  found  INTEGER DEFAULT 0,
  added  INTEGER DEFAULT 0,
  error  TEXT
);

"""

COLS = ("uid", "source", "title", "company", "location", "pay", "posted",
        "posted_at", "exp_min", "url", "tags", "desc_checked")


def _terms_re(terms):
    """Case-insensitive alternation over terms, bounded where possible.

    Plain words are wrapped so "ai" cannot match "email" and "sales" cannot
    match "Salesforce". The guard is an alphanumeric lookaround rather than
    `\\b`, because `_` counts as a word character: `\\bsenior\\b` does not match
    "IN_Senior Associate", which is exactly how Foundit titles its postings.
    Terms with symbols ("c++", ".net", "sr ") are matched literally.
    """
    if not terms:
        return None
    parts = []
    for t in terms:
        t = t.strip()
        if not t:
            continue
        esc = re.escape(t)
        parts.append(rf"(?<![a-z0-9]){esc}(?![a-z0-9])"
                     if t.replace(" ", "").isalnum() else esc)
    return re.compile("|".join(parts), re.I) if parts else None


def _norm(s):
    """Squash a title/company for duplicate detection."""
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


class Store:
    def __init__(self, path):
        self._lock = threading.Lock()
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._db.executescript(SCHEMA)
        self._migrate()
        self._db.commit()

    def _migrate(self):
        """Add columns introduced after a database was first created."""
        info = list(self._db.execute("PRAGMA table_info(jobs)"))
        # an earlier build declared desc_checked NOT NULL, which rejects the
        # NULL that means "not checked this poll"; rebuild it as nullable
        for r in info:
            if r["name"] == "desc_checked" and r["notnull"]:
                self._db.execute("ALTER TABLE jobs DROP COLUMN desc_checked")
                info = list(self._db.execute("PRAGMA table_info(jobs)"))
                break
        have = {r["name"] for r in info}
        for col, decl in (("exp_min", "REAL"), ("applied", "INTEGER NOT NULL DEFAULT 0"),
                          ("applied_at", "REAL"),
                          ("opened", "INTEGER NOT NULL DEFAULT 0"),
                          ("desc_checked", "INTEGER"),
                          ("saved", "INTEGER NOT NULL DEFAULT 0"),
                          ("notes", "TEXT"),
                          ("stage", "TEXT")):
            if col not in have:
                self._db.execute(f"ALTER TABLE jobs ADD COLUMN {col} {decl}")


    def add(self, rows):
        """Insert new listings and refresh the ones we already hold.

        Re-polling updates the fields a site can restate (it may repost a job,
        or start disclosing pay) but never touches `first_seen`, `flagged` or
        `closed` — your marks survive. Returns how many rows were genuinely
        new, which is what the poll log reports.
        """
        if not rows:
            return 0
        refresh = ("posted", "posted_at", "exp_min", "pay", "title",
                   "company", "location", "tags", "desc_checked")
        sql = (f"INSERT INTO jobs ({', '.join(COLS)}, first_seen) "
               f"VALUES ({', '.join('?' * (len(COLS) + 1))}) "
               f"ON CONFLICT(uid) DO UPDATE SET "
               + ", ".join(f"{c}=COALESCE(excluded.{c}, jobs.{c})" for c in refresh))
        now = time.time()
        with self._lock:
            cur = self._db.cursor()
            known = {r[0] for r in cur.execute("SELECT uid FROM jobs")}
            n = sum(1 for r in rows if r.get("uid") not in known)
            for r in rows:
                cur.execute(sql, [r.get(c) for c in COLS] + [now])
            self._db.commit()
        return n

    def feed(self, include_closed=False, per_source=200, max_age_days=None,
             max_exp_years=None, exclude_titles=(), tech_terms=(),
             exclude_companies=(), jobs_first=False,
             require_checked=(), dedupe=True):
        """Newest first, capped *per source*.

        The board is one column per site, so a global cap would let a
        high-volume source (Internshala posts far more than Naukri) push a
        quieter column off the screen entirely.

        Filtering happens here rather than at insert so that rows age out on
        their own and the thresholds can change without re-polling. Unknown
        experience (`exp_min IS NULL`) passes: Indeed publishes none, and it is
        filtered at the URL instead.

        Age and experience filter in SQL; title and tech matching happen in
        Python, because they need word boundaries that LIKE cannot express --
        `%ai%` would match "email" and "chair". The per-source cap is applied
        last, after filtering, so a column fills to `per_source` real matches
        instead of being capped on rows that are then thrown away. Only
        *open* rows count towards the cap: when closed/applied rows are
        included (the tracker view) they ride along uncapped, so a long
        history never pushes live listings out of a column.
        """
        clauses = [] if include_closed else ["closed = 0", "applied = 0"]
        args = []
        if max_age_days:
            clauses.append("COALESCE(posted_at, first_seen) >= ?")
            args.append(time.time() - max_age_days * 86400)
        if max_exp_years is not None:
            clauses.append("(exp_min IS NULL OR exp_min <= ?)")
            args.append(max_exp_years)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        # rowid ASC, not DESC: rows are inserted in the order the site listed
        # them, so for a source that gives no date (Indeed) an identical
        # first_seen across the batch still preserves that site's own ranking.
        sql = (f"SELECT * FROM jobs {where} "
               f"ORDER BY COALESCE(posted_at, first_seen) DESC, rowid ASC")
        with self._lock:
            rows = [dict(r) for r in self._db.execute(sql, args)]

        drop = _terms_re(exclude_titles)
        tech = _terms_re(tech_terms)
        badco = _terms_re(exclude_companies)
        need_check = set(require_checked)
        out, seen, taken = [], set(), collections.Counter()
        for r in rows:
            title = r["title"] or ""
            # Indeed states no experience on the card, so an unchecked row is
            # an unknown we can actually resolve -- hide it until we have.
            if r["source"] in need_check and not r.get("desc_checked"):
                continue
            if badco and badco.search(r["company"] or ""):
                continue
            # Both checks read the tag list as well as the title. Tags are
            # where Naukri hides the truth in either direction: "Walk-in ||
            # Developer" only proves it is technical via its tags, and
            # "SBI Credit card branch sale" only proves it is *not* via tags
            # reading "Sales, Business Development".
            hay = f"{title} {r['tags'] or ''}"
            if drop and drop.search(hay):
                continue
            if tech and not tech.search(hay):
                continue
            if dedupe:
                # Foundit reposts one job per city; collapse to the newest
                key = (r["source"], _norm(title), _norm(r["company"] or ""))
                if key in seen:
                    continue
                seen.add(key)
            if not (r["closed"] or r["applied"]):
                if taken[r["source"]] >= per_source:
                    continue
                taken[r["source"]] += 1
            out.append(r)
        if jobs_first:
            # Internshala tags each row "job" or "internship". Paid jobs are
            # worth more than unpaid internships, so float them to the top of
            # that column. A stable sort keeps newest-first inside each group,
            # and every other source shares one key so its order is untouched.
            out.sort(key=lambda r: 0 if (r.get("tags") or "") == "job" else 1)
        return out

    def uids_with_exp(self, source):
        """Listings we no longer need to open the description for.

        Either we extracted the experience, or we looked and it said nothing --
        both mean a re-fetch would learn nothing new."""
        with self._lock:
            return {r[0] for r in self._db.execute(
                "SELECT uid FROM jobs WHERE source = ? AND "
                "(exp_min IS NOT NULL OR desc_checked = 1)", (source,))}

    def unchecked(self, source, limit=60, max_age_days=None):
        """Stored listings whose description we have never opened.

        The search page only ever shows the newest ~15 per query, so rows fall
        out of it long before we have learned their experience requirement.
        Without this the backlog would never be resolved.
        """
        sql = ("SELECT uid, url FROM jobs WHERE source = ? AND closed = 0 "
               "AND applied = 0 AND COALESCE(desc_checked, 0) = 0 AND url IS NOT NULL")
        args = [source]
        if max_age_days:
            sql += " AND COALESCE(posted_at, first_seen) >= ?"
            args.append(time.time() - max_age_days * 86400)
        sql += " ORDER BY COALESCE(posted_at, first_seen) DESC LIMIT ?"
        args.append(limit)
        with self._lock:
            return [dict(r) for r in self._db.execute(sql, args)]

    def log(self, source, found, added, error=None):
        with self._lock:
            self._db.execute(
                "INSERT OR REPLACE INTO runs (source, ts, found, added, error) "
                "VALUES (?,?,?,?,?)", (source, time.time(), found, added, error))
            self._db.commit()

    def status(self):
        day_ago = time.time() - 86400
        with self._lock:
            runs = [dict(r) for r in self._db.execute("SELECT * FROM runs")]
            open_n = self._db.execute(
                "SELECT COUNT(*) FROM jobs WHERE closed=0 AND applied=0").fetchone()[0]
            applied_24h = self._db.execute(
                "SELECT COUNT(*) FROM jobs WHERE applied=1 AND applied_at >= ?",
                (day_ago,)).fetchone()[0]
            applied_all = self._db.execute(
                "SELECT COUNT(*) FROM jobs WHERE applied=1").fetchone()[0]
            applied_7d = self._db.execute(
                "SELECT COUNT(*) FROM jobs WHERE applied=1 AND applied_at >= ?",
                (time.time() - 7 * 86400,)).fetchone()[0]
            saved = self._db.execute(
                "SELECT COUNT(*) FROM jobs WHERE saved=1 AND applied=0 AND closed=0"
            ).fetchone()[0]
        return {"runs": runs, "open": open_n, "saved": saved,
                "applied_24h": applied_24h, "applied_7d": applied_7d,
                "applied_all": applied_all}
