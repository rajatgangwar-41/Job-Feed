#!/usr/bin/env bash
# Run ONLY the scraper, feeding a Convex deployment you have a key for.
#
# This is for someone donating a machine to keep a board's listings fresh.
# It is not the app: there is no frontend here, no database of your own, and
# nothing to sign in to. The scrape happens locally and the results are
# pushed to whichever deployment backend/.env names.
#
#   ./scripts/scraper.sh            set up if needed, then run
#   ./scripts/scraper.sh --check    verify the setup and exit
#
# What you need from whoever runs the board: the CONVEX_URL, and a poller key
# that is yours alone. Put both in backend/.env (copy .env.example).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
VENV="$BACKEND/.venv"
CHECK_ONLY=false
[ "${1:-}" = "--check" ] && CHECK_ONLY=true

if [ -t 1 ]; then C_OK=$'\e[32m'; C_WARN=$'\e[33m'; C_BAD=$'\e[31m'; C_DIM=$'\e[2m'; C_OFF=$'\e[0m'
else C_OK=; C_WARN=; C_BAD=; C_DIM=; C_OFF=; fi
ok()   { printf '  %s✓%s %s\n' "$C_OK" "$C_OFF" "$*"; }
warn() { printf '  %s!%s %s\n' "$C_WARN" "$C_OFF" "$*"; }
bad()  { printf '  %s✗%s %s\n' "$C_BAD" "$C_OFF" "$*"; }

# ---------------------------------------------------------------- config
# Checked before anything is installed: being told the key is missing is more
# useful than watching a browser download first and fail afterwards.
if [ ! -f "$BACKEND/.env" ]; then
  bad "backend/.env is missing."
  echo "     cp backend/.env.example backend/.env   then fill in:"
  echo "       CONVEX_URL      the deployment to feed (not a secret)"
  echo "       POLLER_SECRET   your own key, from whoever runs the board"
  exit 1
fi
missing=""
for key in CONVEX_URL POLLER_SECRET; do
  value=$(grep -E "^${key}=" "$BACKEND/.env" | head -1 | cut -d= -f2- | tr -d ' "'"'"'')
  case "$value" in
    ""|*your-deployment*) missing="$missing $key" ;;
  esac
done
if [ -n "$missing" ]; then
  bad "backend/.env still needs:$missing"
  exit 1
fi
ok "backend/.env → $(grep -E '^CONVEX_URL=' "$BACKEND/.env" | cut -d= -f2-)"

# ---------------------------------------------------------- python + deps
PY="$VENV/bin/python"
if [ ! -x "$PY" ]; then
  if [ "$CHECK_ONLY" = true ]; then bad "no virtualenv at backend/.venv"; exit 1; fi
  echo "  setting up backend/.venv (first run only)…"
  # --system-site-packages so a distro-managed Playwright is reused rather
  # than downloading a second copy of it.
  python3 -m venv --system-site-packages "$VENV" || { bad "could not create the virtualenv"; exit 1; }
fi
if ! "$PY" -c "import requests, lxml" 2>/dev/null; then
  echo "  installing Python dependencies…"
  "$PY" -m pip install -q --upgrade pip >/dev/null 2>&1
  "$PY" -m pip install -q -r "$BACKEND/requirements.txt" || { bad "pip install failed"; exit 1; }
fi
ok "python dependencies"

# ------------------------------------------------------- browser sources
# Naukri and Indeed are ~two thirds of the feed and both refuse headless
# Chrome, so they need a real browser on a virtual display. Everything else
# is plain HTTP and works without any of this -- hence a warning rather than
# a hard failure: a machine with no Xvfb is still worth running.
browser_ready=true
if ! "$PY" -c "import playwright" 2>/dev/null; then
  if [ "$CHECK_ONLY" = true ]; then warn "playwright not installed"; browser_ready=false; else
    echo "  installing Playwright…"
    "$PY" -m pip install -q playwright || browser_ready=false
  fi
fi
if [ "$browser_ready" = true ] && "$PY" -c "import playwright" 2>/dev/null; then
  if [ "$CHECK_ONLY" = false ]; then
    "$PY" -m playwright install chromium >/dev/null 2>&1 || true
  fi
  ok "playwright"
else
  warn "playwright missing — Naukri and Indeed will be skipped"
  browser_ready=false
fi
if command -v Xvfb >/dev/null 2>&1; then
  ok "Xvfb (virtual display)"
else
  warn "Xvfb missing — Naukri and Indeed will be skipped"
  echo "     ${C_DIM}Fedora: sudo dnf install xorg-x11-server-Xvfb${C_OFF}"
  echo "     ${C_DIM}Debian/Ubuntu: sudo apt install xvfb${C_OFF}"
  browser_ready=false
fi
[ "$browser_ready" = true ] && ok "all 7 sources available" \
  || warn "5 of 7 sources available (the HTTP ones)"

if [ "$CHECK_ONLY" = true ]; then echo "  ready."; exit 0; fi

echo
echo "  ${C_DIM}scraping on this machine, pushing to the deployment above.${C_OFF}"
echo "  ${C_DIM}Ctrl-C to stop. Nothing is served locally.${C_OFF}"
echo
exec "$BACKEND/run.sh"
