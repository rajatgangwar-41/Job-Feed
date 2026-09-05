"""Source adapters. Each takes its slice of config and returns listing dicts.

Every adapter returns rows shaped:
    uid, source, title, company, location, pay, posted, url, tags
`uid` is prefixed with the source so ids can never collide between sites.
"""
import re
import threading
import time
from urllib.parse import quote, urlparse

import requests
from lxml import html as LH

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

_last_hit = {}
_throttle_lock = threading.Lock()
CRAWL_DELAY = 2.5          # seconds between requests to the same host

AGO = re.compile(r"(just now|today|few hours ago|\d+\s+(?:minute|hour|day|week|month)s?\s+ago)", re.I)

_SPAN = {"minute": 60, "hour": 3600, "day": 86400, "week": 604800,
         "month": 2592000, "year": 31536000}


def rel_epoch(text):
    """'5 days ago' / 'Just now' -> unix time. Internshala only gives relatives."""
    if not text:
        return None
    t = text.lower()
    if "just now" in t or "today" in t:
        return time.time()
    if "few hours" in t:
        return time.time() - 3 * 3600
    m = re.match(r"(\d+)\+?\s*(minute|hour|day|week|month)", t)
    return time.time() - int(m.group(1)) * _SPAN[m.group(2)] if m else None


def iso_epoch(text):
    """LinkedIn gives '2026-09-01', Unstop '2026-09-01 14:26'."""
    if not text:
        return None
    from datetime import datetime
    for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(text[:len(datetime.now().strftime(fmt))], fmt).timestamp()
        except ValueError:
            pass
    return None


def _throttle(host):
    with _throttle_lock:
        wait = CRAWL_DELAY - (time.time() - _last_hit.get(host, 0))
        if wait > 0:
            time.sleep(wait)
        _last_hit[host] = time.time()


def get(url, as_json=False, headers=None):
    _throttle(urlparse(url).netloc)
    h = {
        "User-Agent": UA,
        "Accept-Language": "en-IN,en;q=0.9",
        "Accept": "application/json" if as_json else "text/html,application/xhtml+xml",
    }
    h.update(headers or {})
    r = requests.get(url, timeout=25, headers=h)
    r.raise_for_status()
    if as_json:
        return r.json()
    # Force UTF-8: LinkedIn omits a charset meta and lxml then guesses latin-1.
    return LH.fromstring(r.content, parser=LH.HTMLParser(encoding='utf-8'))


def _one(node, xp):
    """First non-empty string match for an xpath, or None."""
    for v in node.xpath(xp):
        s = (v if isinstance(v, str) else v.text_content()).strip()
        if s:
            return re.sub(r"\s+", " ", s)
    return None


# --- Internshala -------------------------------------------------------

EXP_NONE = re.compile(r"no experience required|fresher", re.I)
EXP_YEARS = re.compile(r"(\d+)\s*(?:-\s*\d+\s*)?(?:year|yr)", re.I)


def exp_min_years(text, kind=None):
    """Minimum years of experience a listing asks for. None if unstated.

    Internships are fresher roles by definition, so they short-circuit to 0.
    The card attribute says "internship" but the query kind says "internships",
    so both spellings have to count.
    """
    if kind and str(kind).rstrip("s") == "internship":
        return 0.0
    if not text:
        return None
    if EXP_NONE.search(text):
        return 0.0
    m = EXP_YEARS.search(text)
    return float(m.group(1)) if m else None


FRESHER_RE = re.compile(
    r"fresher|no prior experience|no experience (?:is )?required|"
    r"experience\s*[:\-]?\s*0\b|0\s*[-–to]+\s*1\s*year", re.I)
YEARS_RE = re.compile(
    r"(\d{1,2})\s*(?:\+|plus)?\s*(?:[-–—]|to)?\s*(?:\d{1,2})?\s*\+?\s*(?:years?|yrs?)\b",
    re.I)


def experience_from_text(text):
    """Lowest years-of-experience a description asks for, or None.

    Only counts a match sitting near the word "experience": descriptions are
    full of other numbers ("20 years in business"). Values over 15 are treated
    as unknown -- guessing high wrongly hides a job, so we lean to showing it.
    """
    if not text:
        return None
    if FRESHER_RE.search(text):
        return 0.0
    best = None
    for m in YEARS_RE.finditer(text):
        window = text[max(0, m.start() - 60):m.end() + 60].lower()
        if "experience" not in window and "exp." not in window:
            continue
        try:
            v = float(m.group(1))
        except (TypeError, ValueError):
            continue
        if v <= 15 and (best is None or v < best):
            best = v
    return best


def loose_rel_epoch(text):
    """'15 days', 'almost 6 years', 'about 23 hours' -> unix time.

    Y Combinator prints ages without the word "ago" and with hedges in front.
    """
    if not text:
        return None
    m = re.search(r"(\d+)\s*(minute|hour|day|week|month|year)s?", str(text), re.I)
    return time.time() - int(m.group(1)) * _SPAN[m.group(2).lower()] if m else None


def internshala(cfg):
    rows = []
    for q in cfg.get("queries", []):
        if "path" in q:
            path = q["path"].strip("/")
            fallback = "job" if path.startswith("jobs") else "internship"
        else:
            fallback = q.get("kind", "internships")
            path = f"{fallback}/keywords-{quote(q['keyword'].replace(' ', '-'))}"
        url = f"https://internshala.com/{path}/"
        doc = get(url)
        cards = doc.xpath(
            "//div[contains(concat(' ', normalize-space(@class), ' '),"
            "' individual_internship ')]")
        for c in cards:
            iid = c.get("internshipid")
            href = c.get("data-href") or _one(c, ".//a[@id='job_title']/@href")
            title = _one(c, ".//a[@id='job_title']//text()")
            if not (iid and title):
                continue
            body = c.text_content()
            m = AGO.search(body)
            # a search page mixes both, so trust the card, not the URL.
            # normalise to exactly "job" / "internship" -- the board sorts on it
            etype = c.get("employment_type") or fallback
            etype = "job" if "job" in etype else "internship"
            # experience sits in the same row as location/stipend, e.g.
            # "No experience required" or "1 year(s)"
            meta = " ".join(
                re.sub(r"\s+", " ", n.text_content())
                for n in c.xpath(".//div[contains(@class,'row-1-item')]"))
            rows.append({
                "uid": f"internshala:{iid}",
                "source": "internshala",
                "title": title,
                "company": _one(c, ".//p[contains(@class,'company-name')]//text()"),
                # internships nest it as div.locations > span > a; jobs put it
                # straight into <p class="row-1-item locations">
                "location": _one(c, ".//*[contains(@class,'locations')]") or "—",
                # internships put it in span.stipend; jobs use a plain
                # row-1-item holding span.mobile ("₹ 3,00,000 - 6,00,000 /year")
                "pay": (_one(c, ".//span[contains(@class,'stipend')]//text()")
                        or _one(c, ".//div[contains(@class,'row-1-item')]"
                                   "//span[contains(@class,'mobile')]"
                                   "[contains(., '₹')]//text()")
                        or _one(c, ".//div[contains(@class,'row-1-item')]"
                                   "//span[contains(., '₹')]//text()")),
                "posted": m.group(1).title() if m else None,
                "posted_at": rel_epoch(m.group(1) if m else None),
                "exp_min": exp_min_years(meta, etype),
                "url": "https://internshala.com" + (href or ""),
                "tags": etype,
            })
    return rows


# --- Foundit (public middleware API) -----------------------------------

FOUNDIT_HEADERS = {                       # 400s without these two
    "Referer": "https://www.foundit.in/",
    "Origin": "https://www.foundit.in",
    "Accept": "application/json, text/plain, */*",
}


def _foundit_pay(lo, hi):
    """minimumSalary/maximumSalary are objects; 0 means 'not disclosed'."""
    def lpa(x):
        v = (x or {}).get("absoluteValue") or 0
        return v / 100000 if v else 0
    a, b = lpa(lo), lpa(hi)
    if not (a or b):
        return None
    return f"{a:g}-{b:g} LPA" if a and b else f"{(a or b):g} LPA"


def foundit(cfg):
    rows = []
    for q in cfg.get("queries", []):
        url = ("https://www.foundit.in/middleware/jobsearch"
               f"?start=0&limit={q.get('limit', 30)}&query={quote(q['query'])}"
               f"&locations={quote(q.get('locations', 'india'))}")
        data = get(url, as_json=True, headers=FOUNDIT_HEADERS)
        for d in (data.get("jobSearchResponse") or {}).get("data", []) or []:
            jid = d.get("jobId") or d.get("id")
            path = d.get("seoJdUrl") or d.get("jdUrl")
            if not (jid and path):
                continue
            # createdAt is when the ad was first made; reposted jobs keep an old
            # one while lastUpdated/postedBy track the actual resurfacing.
            fresh = d.get("lastUpdated")
            rows.append({
                "uid": f"foundit:{jid}",
                "source": "foundit",
                "title": d.get("title"),
                "company": d.get("companyName"),
                "location": d.get("locations") or "-",
                "pay": _foundit_pay(d.get("minimumSalary"), d.get("maximumSalary")),
                "posted": d.get("postedBy"),
                "posted_at": (fresh / 1000 if isinstance(fresh, (int, float))
                              else rel_epoch(d.get("postedBy"))),
                # minimumExperience is {"years": N}
                "exp_min": (d.get("minimumExperience") or {}).get("years"),
                "url": "https://www.foundit.in" + path,
                "tags": (d.get("skills") or "")[:80] or None,
            })
    return rows



def _embedded_json(doc, script_id=None, attr=None):
    """Pull a page's embedded state out of the HTML.

    Next.js sites (Cutshort, Wellfound) ship it in <script id="__NEXT_DATA__">;
    Inertia sites (Y Combinator) put it in a data-page attribute. Both beat
    scraping the rendered DOM -- the payload carries dates, pay and experience
    that the visible card leaves out.
    """
    import json
    if script_id:
        got = doc.xpath(f'//script[@id="{script_id}"]/text()')
    else:
        got = doc.xpath(f'//*[@{attr}]/@{attr}')
    if not got:
        return None
    try:
        return json.loads(got[0])
    except ValueError:
        return None


# --- Cutshort ----------------------------------------------------------

def cutshort(cfg):
    """Category pages carry ~50 jobs in the react-query cache.

    Note not every slug is real: /jobs/backend-development-jobs renders with
    no cache at all, so a bad slug yields nothing rather than erroring.
    """
    rows = []
    for q in cfg.get("queries", []):
        doc = get(f"https://cutshort.io/jobs/{q['path'].strip('/')}")
        nd = _embedded_json(doc, script_id="__NEXT_DATA__") or {}
        state = (nd.get("props", {}).get("pageProps", {}) or {}).get("dehydratedState") or {}
        for query in state.get("queries", []):
            data = (query.get("state") or {}).get("data")
            page = (data or {}).get("data", {}).get("pageData") if isinstance(data, dict) else None
            for j in (page or {}).get("jobs", []) or []:
                jid, title = j.get("_id"), j.get("headline")
                if not (jid and title):
                    continue
                exp = j.get("expRange") or {}
                rows.append({
                    "uid": f"cutshort:{jid}",
                    "source": "cutshort",
                    "title": title,
                    "company": (j.get("companyDetails") or {}).get("name"),
                    "location": j.get("locationsText") or "-",
                    "pay": j.get("salaryRangeText"),
                    "posted": None,          # cutshort publishes no date at all
                    "posted_at": None,
                    "exp_min": exp.get("min"),
                    "url": j.get("publicUrl"),
                    "tags": ", ".join(j.get("allSkills") or [])[:80] or None,
                })
    return rows


# --- Wellfound ---------------------------------------------------------

def wellfound(cfg):
    """Role/location pages ship an Apollo cache holding the search results.

    The full description is in that payload, so the experience requirement
    costs no extra request -- unlike Indeed, where it needs a page load each.
    """
    rows = []
    for q in cfg.get("queries", []):
        doc = get(f"https://wellfound.com/{q['path'].strip('/')}")
        nd = _embedded_json(doc, script_id="__NEXT_DATA__") or {}
        cache = (((nd.get("props") or {}).get("pageProps") or {})
                 .get("apolloState") or {}).get("data") or {}
        # startups reference their listings, so invert that into job -> company
        company_of = {}
        for key, val in cache.items():
            if not key.startswith("StartupResult") or not isinstance(val, dict):
                continue
            for ref in val.get("highlightedJobListings") or []:
                if isinstance(ref, dict) and ref.get("__ref"):
                    company_of[ref["__ref"]] = val.get("name")
        for key, j in cache.items():
            if not key.startswith("JobListingSearchResult") or not isinstance(j, dict):
                continue
            jid, title = j.get("id"), j.get("title")
            if not (jid and title):
                continue
            live = j.get("liveStartAt")
            locs = j.get("locationNames") or []
            rows.append({
                "uid": f"wellfound:{jid}",
                "source": "wellfound",
                "title": title,
                "company": company_of.get(key),
                "location": ", ".join(locs) if locs else ("Remote" if j.get("remote") else "-"),
                "pay": j.get("compensation") or None,
                "posted": None,
                "posted_at": float(live) if isinstance(live, (int, float)) else None,
                "exp_min": experience_from_text(j.get("description")),
                "url": f"https://wellfound.com/jobs/{jid}-{j.get('slug') or ''}".rstrip("-"),
                "tags": j.get("primaryRoleTitle") or j.get("jobType"),
            })
    return rows


# --- Y Combinator ------------------------------------------------------

def ycombinator(cfg):
    """ycombinator.com/jobs is public; workatstartup.com needs a login.

    Its Inertia payload states `minExperience` outright ("3+ years"), which no
    other source does.
    """
    rows = []
    for q in cfg.get("queries", []):
        doc = get(f"https://www.ycombinator.com/{q['path'].strip('/')}")
        page = _embedded_json(doc, attr="data-page") or {}
        for j in (page.get("props") or {}).get("jobPostings", []) or []:
            jid, title = j.get("id"), j.get("title")
            if not (jid and title):
                continue
            m = re.search(r"(\d+)", str(j.get("minExperience") or ""))
            # createdAt can read "almost 6 years" on a still-open role, so
            # recency comes from lastActive
            rows.append({
                "uid": f"yc:{jid}",
                "source": "yc",
                "title": title,
                "company": j.get("companyName"),
                "location": (j.get("location") or "-")[:60],
                "pay": j.get("salaryRange") or None,
                "posted": j.get("lastActive"),
                "posted_at": loose_rel_epoch(j.get("lastActive")),
                "exp_min": float(m.group(1)) if m else None,
                "url": "https://www.ycombinator.com" + str(j.get("url") or ""),
                "tags": ", ".join(j.get("skills") or [])[:80] or None,
            })
    return rows


def _browser(name):
    """Playwright is optional, so browser sources are imported on use."""
    def run(cfg):
        import browser
        return getattr(browser, name)(cfg)
    return run


ADAPTERS = {
    "internshala": internshala,
    "foundit": foundit,
    "cutshort": cutshort,
    "wellfound": wellfound,
    "yc": ycombinator,
    "naukri": _browser("naukri"),
    "indeed": _browser("indeed"),
}
