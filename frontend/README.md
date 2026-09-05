# jobfeed frontend

The board itself: a Next.js (App Router) + Tailwind CSS app that reads the
[backend](../backend/README.md)'s JSON API and renders it as three views —
Board, List and Tracker — with a filter panel, search, keyboard shortcuts,
and a light/dark/auto theme. Nothing here polls a job site or touches
`config.json`; that's entirely the backend's job.

## Run it

The backend has to be running first — see [`../backend/README.md`](../backend/README.md).

```bash
npm install
npm run dev                          # -> http://localhost:3000
```

For a production-style run:

```bash
npm run build
npm start                            # -> http://localhost:3000
```

`next.config.mjs` rewrites every `/api/*` request to the backend
(`http://127.0.0.1:8765` by default), so the browser only ever talks to this
Next.js origin — no CORS, no separate base URL to configure client-side. If
the backend runs somewhere else, point at it with:

```bash
BACKEND_URL=http://127.0.0.1:9000 npm run dev
```

Rewrites are re-read on every request in dev and apply to `npm start` too
(this isn't a static export), so changing `BACKEND_URL` just needs a restart,
not a rebuild.

## The screen

Three views, one filter panel, everything on one page. What you choose
(view, theme, density, filters, presets, split view) is remembered per
browser in `localStorage`, under the key `jobfeed.prefs.v2`; none of it
touches the backend or `config.json`.

**Board** — one panel per source, 4 across on a wide screen, dropping to 3,
2 and 1 as the window narrows (or pick a fixed count under *Layout*). Each
panel is newest-first and scrolls inside itself; with more than two rows of
panels the board scrolls as a whole. The heading shows the source, how long
ago it was polled and its count — or `error` in red; hover it for the
message.

**List** — every source merged into one newest-first stream with *Today /
Yesterday / Earlier this week* separators and a coloured source pill on each
row. *Layout → Sort* also offers company A–Z, pay-disclosed-first and
by-source.

**Tracker** — three lanes: *Saved* (starred, not yet applied), *Applied*
(newest application first, with its date) and *Passed on* (hidden or
not-interested). Every card carries a free-text note that autosaves half a
second after you stop typing. The header counts applications in the last
24h, the last 7 days and in total; the 24h figure is the one that actually
predicts interviews.

### Filters

The left panel filters the board and the list instantly, and every option
shows how many listings it would leave. Active filters appear as chips above
the content — click a chip's × to drop it, or *Clear all* / *Reset filters*.
Press `f` to hide the panel; on a screen under 960px wide it's a drawer
behind the ≡ button instead of a column.

| Filter | |
| --- | --- |
| Sources · Type | tick/untick sites; jobs vs internships |
| Experience · Posted within | widen or narrow the scraper's two config cut-offs for your account only. Each change re-runs the Convex feed query with new arguments; `config.json` is untouched and stays the default |
| Location & pay | city substring, remote / work-from-home, pay disclosed |
| Status | new since last visit, saved only, hide already opened, include hidden & applied |
| Hidden companies | added from a row's ⋯ menu (*Hide all from …*), removable here. Stored on your account, unlike the scraper's `exclude_companies` |
| Presets | name the current filter set (search box included) and re-apply it in one click |

The search box matches title, company, location, skill tags and pay. Words
are ANDed and a leading `-` excludes: `python -intern`.

"New since last visit" badges listings that arrived after you last had the
board open. Loads less than ten minutes apart count as one visit, so a
reload does not wipe the badges; a genuinely first-ever visit badges nothing.

### Rows

Each row is one opening: title (links to the posting), company, location,
pay, experience asked, skill tags, and how long ago it was *posted* (not
when we found it — a `~` prefix means the site gave no date and this is
discovery time). Hover a row for its actions:

| | Key | |
| --- | --- | --- |
| ★ | `s` | save — shortlists it into the tracker; the row tints amber and stays on the board |
| ✓ | `a` | applied — turns green and leaves the board; counted in the tracker |
| ⊘ | `r` | not interested — red and struck through, stays visible |
| ✕ | `x` | hide — leaves the feed; tick *include hidden & applied* to see and undo |
| ⋯ | | hide all from this company · copy link · open in a plain tab · toggle opened |

Every mark paints immediately (optimistic update) and is confirmed by a
POST to the backend; if that fails, the row reverts and a toast explains
why. Marks that succeed show their own *Undo* toast for five seconds.
Neither ✓ nor ✕ destroys anything.

Clicking a title opens it and marks the row **opened** — a violet left bar,
stored in the database so it survives reloads. It never hides the row; the
*hide already opened* filter does that, and saved rows are exempt from it.

**Split view** (*Layout*, on by default): a click opens the listing in a
window sized to exactly half your screen, on the right. A web page cannot
tile browser windows — no such API exists — so this is a popup opened at
explicit geometry, which looks the same. Tile jobfeed itself to the left half
once (Super+Left on GNOME) and the pairing holds.

Each listing gets **its own** window, named after its uid. Open as many as
you like and they stay open; clicking one you already have open just
focuses it instead of opening a duplicate. They share the same right-half
geometry, so they stack — newest on top, close it to reveal the one
underneath. Untick split view for ordinary new tabs; if a popup blocker
intervenes, it falls back to a tab by itself.

### Keyboard

`j` / `k` move between rows, `Enter` or `o` opens the focused one, `s` `a`
`r` `x` mark it as above. `/` focuses search and `Esc` clears it (or closes
whatever's open — the help dialog, the row menu, the mobile filter drawer,
in that order). `1` `2` `3` switch views, `f` toggles the filter panel, `d`
toggles compact density, `t` cycles the theme (auto → dark → light), `?`
lists all of this.

### Refresh behaviour

There is nothing to poll. The feed is a Convex subscription, so the server
pushes a new result whenever anything the query read changes — a mark made in
another tab shows up here without waiting for a tick, and the 60s interval,
the visibility listener and the request-ordering guard that used to be needed
are all gone.

**Refresh** in the header is the one thing that still talks to the Python
process: it asks for an out-of-schedule scrape. New listings arrive on their
own once the poller pushes them, so it only matters when you do not want to
wait for the next scheduled poll — and it does nothing if the scraper is not
running on this machine.

## Stack

- **Next.js 16** (App Router, Turbopack dev server) — see `AGENTS.md` in this
  directory if you're extending it; the bundled docs there flag conventions
  that differ from older Next versions.
- **Tailwind CSS v4**, CSS-first config in `src/app/globals.css` — design
  tokens are plain custom properties (`--bg`, `--surface`, `--accent`, …)
  redefined under a `.dark` class, re-exposed as Tailwind colors via
  `@theme inline` so `bg-surface`, `text-text-dim` etc. work directly.
- No state management or data-fetching library — a handful of small hooks
  in `src/hooks/` (`usePrefs`, `useFeed`, `useToasts`) cover it.

```
src/
  app/            layout.js (theme init script, fonts), page.js, globals.css
  components/     Dashboard.jsx (orchestrator) + Header, Sidebar, BoardView,
                  ListView, TrackerView, JobRow, TrackerCard, RowMenu,
                  Toasts, HelpDialog, FilterChips, SourcePill, icons.jsx
  hooks/          usePrefs, useFeed, useToasts, useElementWidth
  lib/            api.js (fetch wrappers), format.js, filters.js, constants.js, cx.js
```
