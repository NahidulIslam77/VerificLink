# VerificLink — Verified Professional & Academic Ecosystem

Full-stack implementation of the VerificLink concept: **no skill, project or paper appears on a profile
until the user passes a proctored, server-graded test.** Recruiters see only verified proof and get
ML-style ranked matches.

```
frontend/  React 18 + Vite + Tailwind        (candidate portal, proctored test runner, recruiter hub, public verify page)
backend/   FastAPI + SQLAlchemy + SQLite     (auth, assessments, proctoring log, jobs, matching, signed credentials)
```

## Run it

Needs **Python 3.10+** (Node.js is only needed if you want to rebuild the frontend; a prebuilt copy is in `frontend/dist`).
The app is its own web server (FastAPI) — it does **not** run through Apache/PHP, so unzipping into `htdocs/` is just a
folder location. Windows: double-click `run.bat`. macOS/Linux: `./run.sh`. Then open http://localhost:8000.

```bash
./run.sh                    # → http://localhost:8000  (API + built frontend)
```

Dev mode with hot reload:

```bash
cd backend  && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/uvicorn app.main:app --reload   # :8000
cd frontend && npm install && npm run dev                                                                                     # :5173 (proxies /api)
```

Demo accounts (password `demo1234`): candidates `alex@demo.dev`, `sarah@demo.dev`, `marcus@demo.dev`;
recruiters `recruiter@neuralscale.dev`, `recruiter@hypercloud.dev`. Their credentials are **seeded demo data**
(flagged in the UI). Register a new candidate to take real tests. `SEED_DEMO=0` disables seeding.

Tests: `cd backend && .venv/bin/python -m pytest` (15 API tests).

## What is implemented (mapped to the spec)

| Spec item | Implementation |
|---|---|
| Auth, candidate & company profiles | JWT auth, PBKDF2 passwords, two roles, editable profile |
| 15-min skill audit → Intermediate / Expert | Server-side MCQ test (66 built-in questions across 11 skills, shuffled per attempt; any other skill via LLM). ≥85 % Expert, ≥60 % Intermediate |
| Cool-down after failure | 30 min per item (`COOLDOWN_MINUTES`); also applies to timeouts, abandonment, invalidation |
| 30-min project defense | GitHub API check: repo must exist, **not be a fork**, and you must be owner or commit author. README/languages feed question generation |
| 30-min research defense | DOI looked up on Crossref, **your surname must be among the authors**; optional PDF upload (text extracted) |
| Dynamic question generation | With `ANTHROPIC_API_KEY`: Claude writes defense questions + rubrics from the repo/paper and grades written answers. Without: template questions from keywords in your material, heuristic grading (capped at 80 %, labelled “heuristic-graded”) |
| Proctoring | Webcam required to start; fullscreen; tab/blur/fullscreen-exit detection; copy/cut/paste/right-click/devtools blocked; second display; camera loss; face count where the browser has `FaceDetector`. Every violation is logged server-side, −5 pts each, more than 8 voids the test |
| Tamper resistance | Correct answers/rubrics never leave the server; the timer, penalties and pass/fail are computed server-side; each credential is HMAC-signed and publicly verifiable at `/verify/<id>` |
| ML matching | `Score = (w_s·Skills + w_c·CodeAlignment + w_r·Research)/Σw`. Skills = mean verified score over required skills; code/research = 0.65·defense score + 35·TF-IDF semantic relevance to the job text. Recruiters set the weights per job |
| Recruiter dashboard | Post jobs, ranked candidates with score breakdown, “Audit proof” modal with signature status, applicants flagged |
| Candidate job board | Personal match % per job, missing skills, apply (requires ≥1 credential) |

## Honest limits (read before production)

* **Browser proctoring is deterrence, not proof.** A determined cheater can use a second device or a
  virtual camera. Face tracking needs Chromium's experimental `FaceDetector`; other browsers fall back to
  camera-presence only (the UI says so). For high stakes, add server-side frame analysis (MediaPipe/OpenCV)
  and human review of the event log (`assessments.events`).
* **Heuristic grading is a demo fallback** — it cannot judge correctness. Set `ANTHROPIC_API_KEY` for real defenses.
  I could not exercise the live LLM path in this environment (no key); it is wrapped to fall back safely.
* **GitHub/Crossref checks** need outbound internet. If unreachable the test proceeds and the credential is
  flagged “ownership/authorship unchecked” (`STRICT_REPO_CHECK=1` rejects instead). These two checks were
  tested with mocks, not against the live APIs.
* Skill audits for skills without a built-in bank require the LLM key; otherwise the API says so.
* Matching uses TF-IDF, not neural embeddings; swap `matching.semantic_similarities` for pgvector/Qdrant to scale.
* Not included: email notifications, rate limiting, password reset, PostgreSQL migrations (Alembic), HTTPS.
  Set a long random `VERIFICLINK_SECRET` — it signs both login tokens and credentials.

## Configuration (env vars, see `backend/.env.example`)

`VERIFICLINK_SECRET`, `ANTHROPIC_API_KEY`, `VERIFICLINK_MODEL`, `GITHUB_TOKEN`, `COOLDOWN_MINUTES`,
`REQUIRE_CAMERA`, `STRICT_REPO_CHECK`, `MAX_VIOLATIONS`, `DATABASE_URL` (any SQLAlchemy URL, e.g. PostgreSQL), `SEED_DEMO`.
