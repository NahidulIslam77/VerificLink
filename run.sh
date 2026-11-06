#!/usr/bin/env bash
# One-command start: builds the frontend (if needed) and serves everything from FastAPI on :8000.
set -e
cd "$(dirname "$0")"
if [ ! -d backend/.venv ]; then python3 -m venv backend/.venv; fi
backend/.venv/bin/pip install -q -r backend/requirements.txt
if [ ! -d frontend/dist ]; then (cd frontend && npm install --no-audit --no-fund && npm run build); fi
cd backend && exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
