# VerificLink — Verified Professional & Academic Ecosystem

Full-stack implementation of the VerificLink concept: no skill, project or paper appears on a profile
until the user passes a proctored, server-graded test. Recruiters see only verified proof and get
ML-style ranked matches.

## What is implemented 
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



