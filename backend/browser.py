"""Naukri and Indeed via a real Chrome window.

Neither is reachable over plain HTTP:

- Naukri's `jobapi/v3/search` answers `406 recaptcha required` and its listing
  HTML is a JS shell.
- Indeed returns `403` on every surface, including RSS.

Headless Chrome is refused by both. Headful Chrome works, so that is what this
uses -- which means it needs a DISPLAY. The window is parked off-screen.

Indeed additionally needs a *warm* profile: a first visit hits a Cloudflare
interstitial, and the clearance cookie it eventually grants is what makes
later visits work. That cookie lives in `.browser-profile/`, so the directory
is worth keeping. If Indeed starts failing, deleting that directory and doing
one manual visit re-warms it.

Playwright is imported lazily: without it the HTTP sources still run.
"""
import os
import re
import shutil
import subprocess
import time
from contextlib import contextmanager

PROFILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".browser-profile")

XVFB_DISPLAY = ":99"
_xvfb = None            # the shared virtual X server, started on first use


def _display_alive(disp):
    """Is an X server actually answering on this display?

    A leftover socket file is not proof: Xvfb can die and leave one behind,
    and Chrome would then hang trying to connect.
    """
    if not os.path.exists(f"/tmp/.X11-unix/X{disp.lstrip(':')}"):
        return False
    if not shutil.which("xdpyinfo"):
        return True                       # socket is the best signal we have
    return subprocess.run(["xdpyinfo", "-display", disp],
                          stdout=subprocess.DEVNULL,
                          stderr=subprocess.DEVNULL).returncode == 0


def _display():
    """Pick the display Chrome should paint to.

    Headless Chrome is refused by both sites even with a warm profile, so the
    browser has to be genuinely headful. Xvfb gives us that without a window
    on screen: a real X server that renders into memory. Sized to match the
    real screen so the fingerprint doesn't change.

    Without Xvfb installed we fall back to the visible display, which works
    but flashes a window on every poll.
    """
    global _xvfb
    if os.environ.get("JOBFEED_DISPLAY"):          # explicit override wins
        return os.environ["JOBFEED_DISPLAY"]
    if not shutil.which("Xvfb"):
        return os.environ.get("DISPLAY")
    # A previous run may still own :99 (restart, or a crash that left it up).
    # Reuse a live one rather than spawning a doomed Xvfb on every poll; the
    # socket alone isn't proof, so actually talk to the server.
    if _xvfb is None and _display_alive(XVFB_DISPLAY):
        return XVFB_DISPLAY
    if _xvfb is None or _xvfb.poll() is not None:
        _xvfb = subprocess.Popen(
            ["Xvfb", XVFB_DISPLAY, "-screen", "0", "1920x1080x24", "-nolisten", "tcp"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        sock = f"/tmp/.X11-unix/X{XVFB_DISPLAY.lstrip(':')}"
        for _ in range(100):                       # ~10s for it to come up
            if os.path.exists(sock):
                break
            time.sleep(0.1)
        else:
            _xvfb.terminate()
            _xvfb = None
            return os.environ.get("DISPLAY")
    return XVFB_DISPLAY

AGO_RE = re.compile(
    r"(just posted|today|posted \d+\+? days? ago|active \d+\+? days? ago|"
    r"\d+\+?\s*(?:minute|hour|day|week|month)s?\s+ago)", re.I)


def _reclaim_profile():
    """Kill any Chrome still holding our profile directory.

    Chrome allows one process per profile. If a poll is interrupted -- the
    service restarts, or the machine is busy and we time out -- the browser
    can outlive it and keep the lock, and then every later poll dies with
    "Opening in existing browser session". The profile is ours alone, so
    reclaiming it is safe; this never touches the user's own Chrome.
    """
    needle = f"--user-data-dir={PROFILE}"
    me = os.getpid()
    for pid in os.listdir("/proc"):
        if not pid.isdigit() or int(pid) == me:
            continue
        try:
            with open(f"/proc/{pid}/cmdline", "rb") as f:
                cmd = f.read().replace(b"\0", b" ").decode("utf8", "ignore")
        except OSError:
            continue
        if needle in cmd and "/chrome" in cmd:
            try:
                os.kill(int(pid), 15)
            except OSError:
                pass
    for _ in range(50):                       # let the lock clear
        if not _profile_busy():
            return
        time.sleep(0.1)


def _profile_busy():
    needle = f"--user-data-dir={PROFILE}"
    for pid in os.listdir("/proc"):
        if not pid.isdigit():
            continue
        try:
            with open(f"/proc/{pid}/cmdline", "rb") as f:
                cmd = f.read().replace(b"\0", b" ").decode("utf8", "ignore")
        except OSError:
            continue
        if needle in cmd and "/chrome" in cmd:
            return True
    return False


@contextmanager
def _page():
    _reclaim_profile()
    display = _display()
    if not display:
        raise RuntimeError(
            "no display: headless Chrome is refused by both sites. Install xvfb "
            "(sudo apt install -y xvfb) or run inside a desktop session.")
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=PROFILE, channel="chrome", headless=False,
            viewport={"width": 1440, "height": 900},
            # On a Wayland session Chrome picks --ozone-platform=wayland and
            # talks to the compositor directly, ignoring DISPLAY -- so the
            # window appears on the desktop and Xvfb is bypassed entirely.
            # Forcing the X11 backend (and hiding WAYLAND_DISPLAY) is what
            # makes the virtual display actually take effect.
            env={**{k: v for k, v in os.environ.items()
                    if k not in ("WAYLAND_DISPLAY", "XDG_SESSION_TYPE")},
                 "DISPLAY": display},
            args=["--disable-blink-features=AutomationControlled",
                  "--ozone-platform=x11",
                  "--window-position=-2400,0"],   # only matters on a real display
        )
        ctx.add_init_script(
            "Object.defineProperty(navigator,'webdriver',{get:()=>undefined})")
        try:
            yield ctx.new_page()
        finally:
            ctx.close()


def _txt(node, sel):
    el = node.query_selector(sel)
    if not el:
        return None
    return " ".join((el.inner_text() or "").split()) or None


def _posted(text):
    """Pull a relative age out of a card's text, normalised for rel_epoch."""
    m = AGO_RE.search(text or "")
    if not m:
        return None
    s = m.group(1).strip()
    if re.match(r"just posted|today", s, re.I):
        return "Just now"
    return re.sub(r"^(posted|active)\s+", "", s, flags=re.I).title()


# --- Naukri ------------------------------------------------------------

def naukri(cfg):
    rows = []
    with _page() as page:
        for q in cfg.get("queries", []):
            slug = re.sub(r"[^a-z0-9]+", "-", q["keyword"].lower()).strip("-")
            # experience=0 is the single biggest win here: without it only
            # about 1 card in 20 asks for zero years, with it about 17 do.
            exp = q.get("experience", cfg.get("experience", 0))
            for pageno in range(1, int(q.get("pages", 1)) + 1):
                # page 2 onward is a "-N" suffix on the path, not a query param
                suffix = "" if pageno == 1 else f"-{pageno}"
                url = (f"https://www.naukri.com/{slug}-jobs{suffix}"
                       f"?sort=f&experience={exp}")     # sort=f = freshest
                page.goto(url, wait_until="domcontentloaded", timeout=45000)
                try:
                    page.wait_for_selector("div.srp-jobtuple-wrapper", timeout=30000)
                except Exception:
                    break                     # blocked, or ran out of pages
                time.sleep(1.2)
                rows.extend(_naukri_cards(page))
    return rows


def _naukri_cards(page):
    from sources import exp_min_years, rel_epoch
    out = []
    for card in page.query_selector_all("div.srp-jobtuple-wrapper"):
        link = card.query_selector("a.title")
        if not link:
            continue
        href = link.get_attribute("href") or ""
        jid = card.get_attribute("data-job-id") or href.rsplit("-", 1)[-1]
        posted = _txt(card, "span.job-post-day")
        tags = [t.inner_text().strip()
                for t in card.query_selector_all("ul.tags-gt li")]
        exp, loc = _txt(card, "span.expwdth"), _txt(card, "span.locWdth")
        out.append({
            "uid": f"naukri:{jid}",
            "source": "naukri",
            "title": " ".join((link.inner_text() or "").split()),
            "company": _txt(card, "a.comp-name"),
            "location": loc or "-",
            "pay": _txt(card, "span.sal-wrap") or _txt(card, "span.sal"),
            "posted": posted,
            "posted_at": rel_epoch(posted),
            "exp_min": exp_min_years(exp),   # "0-3 Yrs" -> 0
            "url": href.split("?")[0],
            "tags": ", ".join([x for x in ([exp] + tags) if x])[:80] or None,
        })
    return out


# --- Indeed ------------------------------------------------------------

COOKIE_BTNS = ["#onetrust-reject-all-handler", "#onetrust-accept-btn-handler"]

# Indeed embeds a full record per card. Far richer than the rendered card,
# which shows no date, no experience and usually no pay.
CARDS_JS = """() => {
  const p = window.mosaic && window.mosaic.providerData
            && window.mosaic.providerData['mosaic-provider-jobcards'];
  const res = p && p.metaData && p.metaData.mosaicProviderJobCardsModel
              && p.metaData.mosaicProviderJobCardsModel.results;
  if (!res) return [];
  return res.map(r => ({
    jk: r.jobkey,
    title: r.displayTitle,
    company: r.company,
    location: r.formattedLocation,
    pubDate: r.pubDate,
    rel: r.formattedRelativeTime,
    salary: r.salarySnippet && r.salarySnippet.text,
    snippet: (r.snippet || '').replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim(),
  }));
}"""

from sources import experience_from_text  # noqa: E402  (shared parser)


def indeed(cfg):
    from sources import rel_epoch
    rows = []
    with _page() as page:
        for q in cfg.get("queries", []):
            # Indeed publishes no date or experience on its cards, so both
            # filters have to be pushed into the URL instead of applied later.
            url = ("https://in.indeed.com/jobs?sort=date"
                   f"&q={q['keyword'].replace(' ', '+')}"
                   f"&l={q.get('location', 'India').replace(' ', '+')}"
                   f"&fromage={cfg.get('max_age_days', 2)}"
                   f"&explvl={cfg.get('explvl', 'entry_level')}")
            page.goto(url, wait_until="domcontentloaded", timeout=45000)
            time.sleep(6)                     # let Cloudflare settle
            for sel in COOKIE_BTNS:           # the consent banner covers the list
                try:
                    if page.locator(sel).count():
                        page.locator(sel).first.click(timeout=3000)
                        time.sleep(1)
                        break
                except Exception:
                    pass
            try:
                page.wait_for_selector("div.job_seen_beacon", timeout=25000)
            except Exception:
                continue                      # still challenged, or no results
            for c in (page.evaluate(CARDS_JS) or []):
                jk, title = c.get("jk"), c.get("title")
                if not (jk and title):
                    continue
                pub = c.get("pubDate")
                rows.append({
                    "uid": f"indeed:{jk}",
                    "source": "indeed",
                    "title": title,
                    "company": c.get("company"),
                    "location": c.get("location") or "-",
                    "pay": c.get("salary"),
                    "posted": c.get("rel"),
                    # pubDate is epoch ms -- a real date, unlike the card
                    "posted_at": (pub / 1000 if isinstance(pub, (int, float))
                                  else rel_epoch(c.get("rel"))),
                    "exp_min": None,          # filled in below
                    # /rc/clk links are tracking redirects; viewjob is stable
                    "url": f"https://in.indeed.com/viewjob?jk={jk}",
                    "tags": (c.get("snippet") or "")[:120] or None,
                })

        # Experience only exists in the full description, so it costs a page
        # load each (~1s). Fetch only for listings we don't already know, and
        # cap the batch so one poll can't run away.
        known = set(cfg.get("known_uids") or ())
        budget = int(cfg.get("max_desc_fetch", 30))
        todo = [r for r in rows if r["uid"] not in known][:budget]

        # Rows already stored but never checked: the search page only shows the
        # newest handful per query, so listings age out of it while still live.
        # Emitted as partial rows -- the upsert COALESCEs, so the NULL fields
        # leave the stored title/company/pay untouched.
        for p in (cfg.get("pending") or [])[:max(0, budget - len(todo))]:
            if p["uid"] in known:
                continue
            stub = {"uid": p["uid"], "source": "indeed", "url": p["url"]}
            rows.append(stub)
            todo.append(stub)

        for r in todo:
            try:
                page.goto(r["url"], wait_until="domcontentloaded", timeout=40000)
                page.wait_for_selector("#jobDescriptionText", timeout=12000)
                r["exp_min"] = experience_from_text(page.inner_text("#jobDescriptionText"))
                # plenty of descriptions never state years; record that we
                # looked, otherwise every poll re-fetches them forever
                r["desc_checked"] = 1
            except Exception:
                continue                      # not checked; retried next poll
    return rows
