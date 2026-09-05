#!/usr/bin/env bash
# Start jobfeed. Prefers .venv, which is where Playwright (needed for Naukri)
# is installed; falls back to system python without it.
cd "$(dirname "$0")"
PY=.venv/bin/python
[ -x "$PY" ] || PY=python3
exec "$PY" app.py
