#!/usr/bin/env bash
# Start both halves of jobfeed -- the Python API and the Next dev server --
# from one terminal, instead of the two-terminal dance in the README.
#
#   ./scripts/dev.sh          both halves, Ctrl-C stops both
#   PORT=4000 ./scripts/dev.sh    put the frontend somewhere else
#
# Each half keeps its own log lines, prefixed so you can tell them apart.
# A half whose port is already serving is left alone rather than started a
# second time, so this is safe to run when one is already up.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

case "${1:-}" in
  -h|--help)
    awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "${BASH_SOURCE[0]}"
    exit 0 ;;
esac

# The backend reads its own port from config.json, so ask that file rather
# than hardcoding a second copy of the number here.
BACK_PORT="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("port",8765))' \
  "$ROOT/backend/config.json" 2>/dev/null)" || BACK_PORT=8765
FRONT_PORT="${PORT:-3000}"

if [ -t 1 ]; then
  C_BACK=$'\e[36m'; C_FRONT=$'\e[35m'; C_WARN=$'\e[33m'; C_DIM=$'\e[2m'; C_OFF=$'\e[0m'
else
  C_BACK=; C_FRONT=; C_WARN=; C_DIM=; C_OFF=
fi
say()  { printf '%s\n' "${C_DIM}··${C_OFF} $*"; }
warn() { printf '%s\n' "${C_WARN}!!${C_OFF} $*" >&2; }

# Something already listening means that half is up -- don't fight it.
port_busy() {
  python3 - "$1" <<'PY'
import socket, sys
s = socket.socket()
s.settimeout(0.4)
sys.exit(0 if s.connect_ex(("127.0.0.1", int(sys.argv[1]))) == 0 else 1)
PY
}

pids=()
stopping=0
cleanup() {
  [ "$stopping" = 1 ] && return
  stopping=1
  trap - INT TERM EXIT
  printf '\n'; say "stopping…"
  # Each half was started with setsid, so it leads its own process group and
  # a negated PID takes down its whole tree -- npm's `next` child, the
  # scraper's headless Chrome, the log prefixer, all of it. Without that,
  # Ctrl-C reaps the wrapper and orphans the servers still holding the ports.
  for pid in "${pids[@]:-}"; do kill -TERM "-$pid" 2>/dev/null; done
  sleep 0.3
  for pid in "${pids[@]:-}"; do kill -KILL "-$pid" 2>/dev/null; done
  wait 2>/dev/null
}
trap cleanup INT TERM EXIT

HAVE_SETSID=1
command -v setsid >/dev/null 2>&1 || HAVE_SETSID=0

launch() { # launch <dir> <prefix> <cmd...>
  local dir=$1 prefix=$2; shift 2
  local runner=(bash -c 'cd "$1" || exit 1; p=$2; shift 2; "$@" 2>&1 | sed -u "s|^|$p|"' _ "$dir" "$prefix")
  [ "$HAVE_SETSID" = 1 ] && runner=(setsid "${runner[@]}")
  "${runner[@]}" "$@" &
  pids+=("$!")
}

started=0
if port_busy "$BACK_PORT"; then
  say "backend already up on :$BACK_PORT — leaving it alone"
else
  [ -x "$ROOT/backend/.venv/bin/python" ] || warn "no backend/.venv — Naukri and Indeed need Playwright from it (see backend/README.md)"
  launch "$ROOT/backend" "${C_BACK}backend ${C_OFF}${C_DIM}│${C_OFF} " ./run.sh
  started=1
fi

if port_busy "$FRONT_PORT"; then
  say "frontend already up on :$FRONT_PORT — leaving it alone"
else
  if [ ! -d "$ROOT/frontend/node_modules" ]; then
    say "installing frontend dependencies (first run)…"
    (cd "$ROOT/frontend" && npm install) || { warn "npm install failed"; exit 1; }
  fi
  launch "$ROOT/frontend" "${C_FRONT}frontend${C_OFF} ${C_DIM}│${C_OFF} " npm run dev -- -p "$FRONT_PORT"
  started=1
fi

if [ "$started" = 0 ]; then
  say "both halves were already running — nothing to start"
  trap - INT TERM EXIT
  exit 0
fi

say "board → ${C_FRONT}http://localhost:$FRONT_PORT${C_OFF}   api → ${C_BACK}http://127.0.0.1:$BACK_PORT/api/feed${C_OFF}"
say "${C_DIM}Ctrl-C stops both${C_OFF}"

# Either half exiting on its own is a failure worth surfacing -- shut the
# other down too rather than leaving half a stack running.
wait -n
# A Ctrl-C also lands here, via the interrupted wait -- only say this when
# the half really did fall over on its own.
[ "$stopping" = 1 ] || warn "one half exited — shutting the other down"
