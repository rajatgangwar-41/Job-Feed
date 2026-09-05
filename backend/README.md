# jobfeed backend

Polls the newest tech openings across Internshala, Foundit, Naukri, Indeed,
Cutshort, Wellfound and Y Combinator, dedupes them into SQLite, and serves
the result as a small JSON API. It never applies to or submits anything on
your behalf — that part is still you.

```
poll every 10 min  ->  SQLite (dedupe)  ->  http://127.0.0.1:8765/api/*
```

This is the backend half of jobfeed. The board itself — the screen you
actually look at — is the separate Next.js app in [`../frontend`](../frontend/README.md).
Run both and open **http://localhost:3000**; this server on its own has no UI, just JSON.

## Run it

```bash
python3 -m venv --system-site-packages .venv
.venv/bin/pip install -r requirements.txt
./run.sh                             # -> http://127.0.0.1:8765/api/health
```

`run.sh` uses `.venv` if it exists, which is where Playwright lives. Without it
Internshala and Foundit still work; Naukri and Indeed report errors.

The poller runs on its own schedule regardless of whether anything is reading
the API; a poll happens immediately on startup, then every `poll_minutes`. A
full poll takes ~45s, most of it the two browser sources. Trigger one early
with `POST /api/poll` (the frontend's *Refresh* button does this) or just
wait for the next scheduled one.

## API

Almost nothing, since the move to Convex. The board reads listings from
Convex over a live subscription and writes marks, notes and stages as Convex
mutations scoped to the signed-in account, so this process serves two
endpoints, both for this machine only:

| Method | Path | |
| --- | --- | --- |
| GET | `/` or `/api/health` | `{service, ok, last_poll, running}` — a liveness probe, used by the systemd unit |
| POST | `/api/poll` | trigger an out-of-schedule poll. Fire-and-forget, replies `202` immediately. This is what the board's *Refresh* button calls |

The handlers that used to serve the feed and accept marks/notes/stages were
removed rather than left running: they wrote per-user state into a SQLite
database that no longer backs any board, over an endpoint with no
authentication at all.

Listings reach Convex the other way now — `convex_push.py` posts the curated
pool to an HTTP action after every poll, authenticated with a shared secret.
See `.env.example`.

CORS is wide open (`Access-Control-Allow-Origin: *`). That sounds louder than
it is: the server only ever binds `127.0.0.1`, so CORS — which governs which
*browser origins* may read a response, not who can reach the socket — adds no
real exposure here.

## Deploying it

`jobfeed.service` is a ready systemd **user** unit:

```bash
cp jobfeed.service ~/.config/systemd/user/
# edit WorkingDirectory/ExecStart in it first -- see the comment at the top
systemctl --user daemon-reload
systemctl --user enable --now jobfeed
journalctl --user -u jobfeed -f          # follow the poll log
loginctl enable-linger $USER             # survive logout
```

This unit starts only the backend. If you want the board reachable too,
build the frontend (`cd ../frontend && npm run build`) and run `npm start`
alongside it — see [`../frontend/README.md`](../frontend/README.md) for a systemd unit for that half.

**Where it can run, and what survives:**

| Target | |
| --- | --- |
| This machine, plugged in and logged in | Everything works. A locked screen is fine — only logging out removes `DISPLAY` and with it Naukri and Indeed |
| Headless box on your home network | Install `xvfb` and use the `xvfb-run` ExecStart in the unit. Keeps your residential IP, which is what Indeed's Cloudflare clearance depends on. **This is the best 24/7 option** |
| Cloud VPS | Internshala and Foundit work. Naukri needs Xvfb and is unproven from a datacenter IP. Indeed will almost certainly fail — the warm-profile trick worked from a residential address, and Cloudflare treats datacenter ranges far more harshly |
| Public multi-user service | No. Single-user by design, and scraping for many users from one IP gets that IP blocked |

**Before exposing it anywhere: there is no authentication at all.** The server
binds `127.0.0.1` deliberately. Reach it remotely over an SSH tunnel
(`ssh -L 8765:127.0.0.1:8765 host -L 3000:127.0.0.1:3000`), not by changing
the bind address — doing that publishes your job board, and its mark/close
endpoints, to the internet.

A laptop on battery will sleep and stop polling. Check with
`gsettings get org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type`
— `'nothing'` means it stays awake on AC.

## Configure

Edit `config.json` and restart. Keywords are the main thing you'll change.

```json
"internshala": { "queries": [ {"kind": "internships", "keyword": "backend"},
                              {"kind": "jobs",        "keyword": "backend"} ] }
"foundit":     { "queries": [ {"query": "backend developer",
                               "locations": "india", "limit": 30} ] }
"naukri":      { "queries": [ {"keyword": "backend developer"} ] }
"indeed":      { "queries": [ {"keyword": "backend developer",
                               "location": "India"} ] }
```

- Set `"enabled": false` on any source to drop it.
- `poll_minutes` is 10. Going much below that mostly re-fetches the same
  listings; postings don't appear faster than that.
- Each Naukri and Indeed query is a page load in a real browser, so keep those
  lists short. A full four-source poll takes ~45s.

## Filters

Only **technical** fresher / ~1-year roles posted in the last 2 days reach the
screen.

```json
"filters": {
  "max_age_days": 2,
  "max_experience_years": 1,
  "exclude_titles": ["senior", "lead", "principal", "architect", ...]
}
```

Filtering happens **at query time, not at fetch time**, so rows age out of the
board on their own and you can change a threshold and reload without
re-polling. The header shows the active rule and the count getting through.

How experience is determined, per source:

| Source | |
| --- | --- |
| Internshala | internships are fresher by definition → 0. Job cards state it: "No experience required" or "1 year(s)" |
| Foundit | `minimumExperience: {years: N}` |
| Naukri | the card's `0-3 Yrs`, lowest number taken |
| Indeed | **publishes none on the card** — read from the full description, see below |

Indeed's URL also carries `&fromage=2` to match `max_age_days`.

### Indeed experience: read from the description

Indeed's own `explvl=entry_level` filter is close to useless — a sample of six
jobs it returned wanted 3, 4, 4, 5, 5 and 3+ years. So `browser.py` opens each
listing's description and pulls the requirement out of the prose.

- Only the lowest figure that sits within 60 characters of the word
  "experience" counts. Descriptions are full of unrelated numbers, and
  "our firm brings 20 years of experience" is not a requirement.
- Values above 15 years are treated as unknown rather than believed. Guessing
  high wrongly *hides* a job, so the failure leans towards showing it.
- A description that never mentions years is recorded as **checked** anyway
  (`desc_checked`), otherwise every poll would re-fetch it forever.
- `require_checked: ["indeed"]` keeps unchecked Indeed rows off the board.
  Since the experience is knowable, showing it before we know is just noise.

The search page only lists the newest ~15 per query, so listings age out of it
while still live. `store.unchecked()` feeds those back in as a backlog, capped
at `max_desc_fetch` per poll, emitted as partial rows — the upsert COALESCEs
every column, so the NULL fields leave the stored title and pay untouched.

Cost: about 1s per description. A poll runs ~110s normally, and longer while a
backlog is being worked off.

Indeed's embedded card JSON (`window.mosaic.providerData`) is also where its
**real posted date** comes from (`pubDate`, epoch ms) along with the salary —
neither is on the rendered card.

`tech_terms` is an allow-list: a listing must match one of these in its title
or skill tags or it never appears. Internshala's keyword pages leak unrelated
roles ("Content and Social Media Marketing" under a web-development search),
and an allow-list is the only reliable way to keep the board technical.
`exclude_nontech` then removes the rest — sales, HR, finance and so on.

Both lists are matched against **title and tags together**. Tags are where
Naukri gives the game away in both directions: "Walk-in || Ui Developer" only
proves it is technical through its tags, and "SBI Credit card branch sale"
only proves it is *not* through tags reading "Sales, Business Development".

Matching uses an alphanumeric lookaround, not `\b`, and not a plain substring:

- plain substring would drop "**Sales**force Developer" and "microservices
  **architect**ure"
- `\b` misses "IN_**Senior** Associate", because `_` is a word character —
  and that is exactly how Foundit titles its postings
- the lookaround gets all three right

`jobs_first` floats Internshala's paid **jobs** above its unpaid internships
inside that column. Internshala tags every row `job` or `internship`; the sort
is stable, so newest-first still holds inside each group and the other three
columns are untouched.

`exclude_companies` is a blocklist matched against the company name only. It
exists for outfits that flood Internshala with unpaid listings. Entries are
the distinctive stem ("nayepankh", not "NayePankh Foundation Trust") so a
change of legal suffix doesn't slip past.

`exclude_titles` exists because experience data lies. Foundit tags plenty of
"Senior Software Engineer" postings as `0 years`, and Indeed states nothing at
all, so a title check is the only thing that keeps senior roles out of a
fresher board. It is a substring match on the title, so keep the entries
lowercase and specific — `"sr "` with the trailing space avoids matching
"Sr" inside other words.

Unknown experience (`exp_min IS NULL`) **passes** the filter rather than being
dropped. Dropping it would empty the Indeed column entirely. The consequence
is that Indeed's column is the least strictly filtered of the four.

## Source status

Target list: **Naukri, Internshala, Indeed, Foundit.** All four work.

| Source | | Notes |
| --- | --- | --- |
| Internshala | HTTP | two shapes: `/jobs/<category>-jobs/` category pages (~50 pure job rows each) and `/internships/keywords-X/` search pages (~40, mixed). Richest data of any source: pay, location, experience, relative post time |
| Foundit | HTTP | public `/middleware/jobsearch` JSON API. 400s unless `Origin` + `Referer` are sent |
| Naukri | Chrome | real headful Chrome only — see below |
| Cutshort | HTTP | `/jobs/<slug>-jobs` category pages, ~50 each, react-query cache. States `expRange.min` but **no date at all** |
| Wellfound | HTTP | `/role/l/<role>/<place>` pages, Apollo cache. Full description inline, so experience is free; `liveStartAt` is a real epoch |
| Y Combinator | HTTP | `ycombinator.com/jobs/role/<role>`, Inertia `data-page`. States `minExperience` outright. `workatstartup.com` needs a login and is not used |
| Indeed | Chrome | real headful Chrome, and only with a warmed profile — see below |

### Naukri needs a real browser

Plain HTTP cannot reach it, and neither can headless Chrome:

- `jobapi/v3/search` → `406 recaptcha required`, even with a full cookie
  session and the right `appid` / `systemid` / `clientid` headers.
- The listing HTML is a JS shell — no `__INITIAL_STATE__`, no embedded jobs.
- Headless Chrome (`--headless=new`, real Chrome channel) → flat `403 Access
  Denied`.
- Headful Chrome → `200`, all 20 cards. This is the only thing that works.

So `browser.py` drives real Chrome (`channel="chrome"`, not bundled Chromium)
**headful, which means it needs a `DISPLAY`.** The window is launched at
`--window-position=-2400,0` so it sits off the visible desktop instead of
stealing focus on every poll. It keeps its own profile in
`.browser-profile/`, so cookies accumulate and it looks more like a returning
visitor over time — it does not touch your normal Chrome profile, so your
browser can stay open.

Naukri sorts by relevance by default, which surfaces "3+ weeks ago" postings,
so the URL pins `?sort=f` (freshest first).

Two things decide how much Naukri actually contributes:

- **`experience=0` in the URL.** Without it roughly 1 card in 20 asks for zero
  years; with it, about 17 in 20 do. Naukri is mostly non-fresher listings, so
  filtering server-side is worth far more than fetching more pages.
- **Pagination.** Page 2 onward is a `-N` suffix on the path
  (`/backend-developer-jobs-2`), not a query parameter. `pages` per query
  controls how deep to go; each page is one browser navigation, ~6s.

### Hiding the browser window: install Xvfb

```bash
sudo apt install -y xvfb        # then restart jobfeed
sudo dnf install -y xorg-x11-server-Xvfb   # Fedora
```

With Xvfb present, `browser.py` starts a virtual X server on `:99` (1920x1080,
matching the real screen so the fingerprint is unchanged) and points Chrome at
it. Chrome is still genuinely headful — which is the part both sites check —
but it renders into memory and **nothing appears on your desktop**.

On a **Wayland** desktop (GNOME's default) Chrome would otherwise ignore
`DISPLAY` and open on the real screen anyway, because it prefers Wayland
whenever it sees `WAYLAND_DISPLAY`. `browser.py` therefore launches it with
`--ozone-platform=x11` and strips `WAYLAND_DISPLAY` from its environment, so
the Xvfb display is the only one it can reach.

Without Xvfb it falls back to the visible display and a window flashes on
every poll. `--window-position=-2400,0` tries to park it off-screen, but a
window manager that clamps windows back on-screen will defeat that.

`JOBFEED_DISPLAY=:0` forces a specific display and skips Xvfb entirely.

**`headless=True` does not work** — retested against a fully warmed profile:
Naukri returns `403 Access Denied` and Indeed `403 Blocked`. Xvfb is the only
way to get an invisible browser past these two.

Xvfb also removes the need for a logged-in desktop session, so it is what
makes a genuine headless 24/7 box possible.

### Indeed needs a *warm* browser profile

Indeed is the most fragile source here, and it only works because of a quirk
worth writing down.

Every plain-HTTP surface returns `403` — search page, mobile `/m/`, and all
four RSS variants (their public API was retired years ago). Headless Chrome is
refused outright. Headful Chrome on a **fresh** profile hits a Cloudflare
interstitial that never clears: 50s stuck on "Just a moment…", ending at
"Additional Verification Required" with a Ray ID.

But that failed attempt is what fixes it. Cloudflare eventually writes a
clearance cookie into the profile, and **later visits using the same profile
sail through** — the search page loads with all its cards. So the state in
`.browser-profile/` is doing the real work, not any cleverness in the code.

Practical consequences:

- **Don't delete `.browser-profile/`.** Losing it means Indeed starts failing
  until the profile re-warms.
- If Indeed does start failing, open that same profile in a visible window and
  load Indeed by hand once, then let polling resume.
- Clearance cookies expire. Indeed erroring in the header for a poll or two,
  then recovering, is expected rather than a bug.

**Indeed publishes no posted date** on its cards — there is no "ago" text in
the markup at all. So its rows show `~` (discovery time) rather than a real
age. The URL pins `?sort=date`, and rows are stored in the order Indeed lists
them, so the column ordering is still genuinely newest-first — it just can't
show you a number. Card links are rewritten from `/rc/clk?...` tracking
redirects to stable `viewjob?jk=` URLs.

### The startup boards are low-yield for a fresher

Cutshort, Wellfound and Y Combinator all parse cleanly, but their listings
skew senior and, on Wellfound, old:

| | median experience asked | surviving the 2-day / <=1y filter |
| --- | --- | --- |
| Cutshort | 4 years | ~17 of 141 |
| Wellfound | 3 years | ~0 of 95 — most are 18-34 days old |
| Y Combinator | 3 years | ~2 of 42, and mostly US-based |

Wellfound in particular publishes a real `liveStartAt`, and its Indian
listings are simply weeks old, so a 2-day window excludes nearly all of them.
Raising `max_age_days` (or making it per-source) is the only thing that would
make those three contribute meaningfully.

### Foundit field notes

- `createdAt` is when the ad was *first* created; reposted jobs keep a stale
  one. `lastUpdated` / `postedBy` track the real resurfacing, so sorting uses
  `lastUpdated` — otherwise live jobs sink below year-old timestamps.
- `minimumSalary` / `maximumSalary` are objects, and `0` means "not disclosed",
  which is most rows.
- The field names are `jdUrl` / `seoJdUrl` — not `jdURL`.

## Behaviour worth knowing

- **2.5s between requests to the same host**, one poll at a time. Internshala
  URLs are path-based, so nothing hits the `/*?*` paths its robots.txt
  disallows.
- **Dedupe is by the site's own listing id**, so re-polling only ever adds new
  rows. Your red/closed marks survive every poll.
- **Sorted by the site's own posted time**, not discovery time — otherwise a
  whole batch shares one timestamp and ordering is arbitrary. A `~` prefix in
  the age column means we only know when we found it.
- **One failing source never stops the others**; its name shows in red in the
  header and the rest still update. If Chrome or the display goes away, Naukri
  and Indeed error and Internshala/Foundit carry on.
- If a site changes its HTML, that source returns 0 rows and logs "the site
  layout may have changed" rather than silently storing blanks.
