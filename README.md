# jobfeed

One screen showing the newest fresher/junior tech openings across
Internshala, Foundit, Naukri, Indeed, Cutshort, Wellfound and Y Combinator.
It polls in the background; you open the tab, scan what's new, click through
to apply yourself. It never applies to or submits anything on your behalf.

```
poll every 10 min -> SQLite (dedupe) -> push -> Convex -> Next.js board
     backend/                                  (hosted)   :3000
                                                  ^
                                              Clerk auth
```

The scraper cannot be hosted: Naukri and Indeed need a real, warmed Chrome
driven by Playwright. So it stays a local Python process, and pushes the
curated listing pool into Convex, which is what every signed-in board reads.

| | | |
| --- | --- | --- |
| [`backend/`](backend/README.md) | Python | polls the job sites, dedupes into SQLite, pushes the curated pool to Convex. Also serves the small JSON API the manual **Refresh** button hits. No UI. |
| `frontend/convex/` | Convex | the database and its functions — the shared `jobs` pool, and per-user `users` / `userJobs` / `stages` / `stageEvents` keyed by Clerk id. Preferences, presets and hidden companies live in `users.prefs`, so they follow you between browsers. |
| [`frontend/`](frontend/README.md) | Next.js + Tailwind | `/` is the public landing page, `/dashboard` is the board — protected by Clerk, reading Convex over a live subscription. |

Listings are shared; everything personal is not. The flags, notes and pipeline
columns live in `userJobs` and `stages`, scoped by the Clerk user id taken from
the verified identity — never from a request argument — so no call shape reaches
another person's board.

## Run it

Once set up (below), one command:

```bash
./scripts/dev.sh                     # both halves, Ctrl-C stops both
```

## First-time setup

Convex and Clerk each need a one-time provisioning step. Neither secret has to
be typed by hand — both CLIs write their own keys into `frontend/.env.local`.

```bash
cd frontend

# 1. Clerk. Creates an application and writes the keys; no account or login
#    needed, and it prints a URL to claim the app afterwards. Already have a
#    Clerk app? Use `npx clerk@latest env pull` instead.
npx clerk@latest init

# 2. Convex. Opens a browser to log in, creates the project, writes
#    CONVEX_DEPLOYMENT + NEXT_PUBLIC_CONVEX_URL, generates convex/_generated,
#    and pushes the schema and functions. Leave it running while developing.
npx convex dev
```

Then wire the two together — Convex has to trust Clerk's tokens:

1. Clerk dashboard → **Configure → JWT Templates → New template → Convex**.
   Leave it named exactly `convex`; copy the **Issuer** URL it shows.
2. Tell Convex about it, and set the secret the scraper pushes with:

```bash
cd frontend
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-app.clerk.accounts.dev
npx convex env set POLLER_SECRET "$(openssl rand -hex 32)"
npx convex env get POLLER_SECRET        # copy this into backend/.env
```

3. `cp backend/.env.example backend/.env` and fill in `CONVEX_URL` (the
   `NEXT_PUBLIC_CONVEX_URL` value) and the same `POLLER_SECRET`. Without them
   the scraper still runs locally, it just skips the push.

The backend pushes what is already on disk at startup, so the board has
listings the moment you sign in rather than after the first scrape.

Output from each half is prefixed so you can tell them apart, and a half
whose port is already serving is left alone rather than started twice, so
it is safe to re-run when one is already up. `PORT=4000 ./scripts/dev.sh`
moves the frontend; the backend's port comes from `backend/config.json`.

First time only, the backend wants a venv — Playwright lives in it, and
Naukri and Indeed need Playwright:

```bash
cd backend
python3 -m venv --system-site-packages .venv
.venv/bin/pip install -r requirements.txt
```

Or run the two halves in two terminals yourself, which is what the script
is doing:

```bash
cd backend && ./run.sh               # -> http://127.0.0.1:8765
cd frontend && npm run dev           # -> http://localhost:3000
```

Open **http://localhost:3000**. You land on the public page; sign in and you
are taken to `/dashboard`. The board reads Convex, so it works with the
scraper stopped — you simply stop getting new listings. The scraper runs fine
on its own and has no screen of its own to look at.

Each half has its own README with the real depth: [`backend/README.md`](backend/README.md)
covers configuring keywords and filters, deploying it as a systemd service,
and the considerable amount of per-source scraping detail (why Naukri and
Indeed need a real, warmed Chrome profile, Xvfb, etc.). [`frontend/README.md`](frontend/README.md)
covers the UI itself and how to build/run it for real use.

## Before exposing this anywhere

The board is behind Clerk, and every Convex function scopes its rows to the
verified Clerk identity. The **scraper** still has no authentication of its own
and both local processes bind `127.0.0.1` deliberately —
reach them remotely over an SSH tunnel, not by changing the bind address.
See the security note in [`backend/README.md`](backend/README.md#deploying-it) for why, and for what a laptop
on battery needs to keep polling.
