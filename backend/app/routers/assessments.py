"""Proctored test lifecycle: start (pending) -> begin (active, clock starts) -> events -> submit -> graded.

Answers, rubrics and the source material live in `Assessment.payload` and are never sent to the client.
Scoring, penalties and the pass/fail decision are all computed here, so a tampered browser cannot award itself a badge.
"""
from datetime import timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import grading, llm
from ..config import settings
from ..database import get_db
from ..models import Assessment, Credential, User, new_id, utcnow
from ..questions import available_topics, build_skill_questions, canonical_topic
from ..schemas import BeginIn, EventIn, ProjectStartIn, SkillStartIn, SubmitIn
from ..security import require_candidate, sign_credential
from ..sources import SourceRejected, extract_pdf_text, inspect_doi, inspect_repo, normalise_doi, normalise_repo_key

router = APIRouter(prefix="/api/assessments", tags=["assessments"])

FAIL_STATES = ("failed", "invalidated", "expired", "abandoned")
VIOLATION_TYPES = {
    "tab_hidden", "window_blur", "fullscreen_exit", "copy", "cut", "paste", "contextmenu",
    "devtools_shortcut", "no_face", "multiple_faces", "camera_lost", "multiple_displays",
}
INFO_TYPES = {"session_resumed", "fullscreen_enter", "camera_on", "face_tracking_unavailable"}
MERGE_WINDOW_SECONDS = 1.5  # blur + visibilitychange + fullscreen exit often fire together: count once


# ------------------------------------------------------------------ helpers
def _rating(score: int) -> str:
    return "Expert" if score >= settings.expert_score else "Intermediate"


def _reap(db: Session, user: User) -> None:
    """Expire active tests whose deadline (plus grace) has passed."""
    now = utcnow()
    for a in db.query(Assessment).filter(Assessment.user_id == user.id, Assessment.status == "active").all():
        if a.deadline and now > a.deadline + timedelta(seconds=settings.submit_grace_seconds):
            _finish(a, "expired", 0, 0, {"message": "Time expired before submission.", "passed": False}, a.deadline)
    db.commit()


def _finish(a: Assessment, status: str, raw: int, score: int, result: dict, ended=None) -> None:
    a.status, a.raw_score, a.score = status, raw, score
    a.rating = result.get("rating")
    a.result = result
    a.ended_at = ended or utcnow()


def _cooldown_remaining(db: Session, user_id: int, kind: str, key: str) -> int:
    last = (
        db.query(Assessment)
        .filter(Assessment.user_id == user_id, Assessment.kind == kind, Assessment.key == key,
                Assessment.status.in_(("passed",) + FAIL_STATES))
        .order_by(Assessment.ended_at.desc())
        .first()
    )
    if not last or last.status == "passed" or not last.ended_at:
        return 0
    end = last.ended_at + timedelta(minutes=settings.cooldown_minutes)
    return max(0, int((end - utcnow()).total_seconds()))


def _client_questions(a: Assessment) -> list[dict]:
    out = []
    for q in a.payload.get("questions", []):
        item = {"id": q["id"], "type": q["type"], "prompt": q["prompt"]}
        if q["type"] == "mcq":
            item["options"] = q["options"]
        out.append(item)
    return out


def _view(a: Assessment) -> dict:
    now = utcnow()
    remaining = None
    if a.status == "active" and a.deadline:
        remaining = max(0, int((a.deadline - now).total_seconds()))
    elif a.status == "pending":
        remaining = a.duration_seconds
    view = {
        "id": a.id, "kind": a.kind, "title": a.title, "status": a.status,
        "duration_seconds": a.duration_seconds, "remaining_seconds": remaining,
        "violation_count": a.violation_count, "max_violations": settings.max_violations,
        "question_count": len(a.payload.get("questions", [])),
        "grading_mode": a.grading_mode, "require_camera": settings.require_camera,
        "result": a.result if a.status not in ("pending", "active") else None,
    }
    if a.status == "active":
        view["questions"] = _client_questions(a)
    return view


def _get_own(db: Session, user: User, assessment_id: str) -> Assessment:
    a = db.get(Assessment, assessment_id)
    if not a or a.user_id != user.id:
        raise HTTPException(404, "Assessment not found")
    return a


def _start(db: Session, user: User, kind: str, title: str, key: str, minutes: int, build) -> dict:
    """Common start flow. `build()` -> (questions, context, grading_mode, material) and may raise HTTPException."""
    _reap(db, user)
    wait = _cooldown_remaining(db, user.id, kind, key)
    if wait:
        raise HTTPException(429, detail={"message": "Cool-down active after your last attempt.", "retry_after_seconds": wait})

    open_tests = db.query(Assessment).filter(Assessment.user_id == user.id, Assessment.status.in_(("pending", "active"))).all()
    for a in open_tests:  # same subject -> resume instead of regenerating
        if a.kind == kind and a.key == key:
            return _view(a)

    questions, context, mode, material = build()

    for a in open_tests:  # starting something else forfeits any test in progress
        if a.status == "pending":
            a.status, a.ended_at = "cancelled", utcnow()
        else:
            _finish(a, "abandoned", 0, 0, {"message": "Abandoned — another test was started.", "passed": False})

    a = Assessment(
        user_id=user.id, kind=kind, title=title, key=key, duration_seconds=minutes * 60,
        payload={"questions": questions, "material": material}, context=context, grading_mode=mode,
    )
    db.add(a)
    db.commit()
    return _view(a)


# ------------------------------------------------------------------ meta
@router.get("/config")
def config():
    return {
        "skill_minutes": settings.skill_minutes, "defense_minutes": settings.defense_minutes,
        "cooldown_minutes": settings.cooldown_minutes, "pass_score": settings.pass_score,
        "expert_score": settings.expert_score, "violation_penalty": settings.violation_penalty,
        "max_violations": settings.max_violations, "require_camera": settings.require_camera,
        "llm_enabled": llm.enabled(), "skill_topics": available_topics(),
    }


@router.get("")
def history(user: User = Depends(require_candidate), db: Session = Depends(get_db)):
    _reap(db, user)
    rows = (
        db.query(Assessment)
        .filter(Assessment.user_id == user.id, Assessment.status.notin_(("pending", "cancelled")))
        .order_by(Assessment.created_at.desc()).limit(20).all()
    )
    out = []
    for a in rows:
        item = {"id": a.id, "kind": a.kind, "title": a.title, "status": a.status, "score": a.score,
                "rating": a.rating, "violations": a.violation_count,
                "ended_at": a.ended_at.isoformat() + "Z" if a.ended_at else None}
        if a.status in FAIL_STATES:
            item["retry_after_seconds"] = _cooldown_remaining(db, user.id, a.kind, a.key)
        out.append(item)
    return out


# ------------------------------------------------------------------ start endpoints
@router.post("/skill", status_code=201)
def start_skill(body: SkillStartIn, user: User = Depends(require_candidate), db: Session = Depends(get_db)):
    topic = canonical_topic(body.skill)
    title = topic or body.skill.strip()

    def build():
        if topic:
            qs, mode = build_skill_questions(topic, 5), "bank"
        elif llm.enabled():
            try:
                qs, mode = llm.generate_skill_questions(title), "ai"
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(503, f"Could not generate questions for '{title}' right now: {exc}")
        else:
            raise HTTPException(422, detail={
                "message": f"No built-in question bank for '{title}'. Choose one of the supported skills "
                           "or set ANTHROPIC_API_KEY to enable AI-generated audits for any skill.",
                "available": available_topics()})
        questions = [{"id": f"q{i + 1}", "type": "mcq", **q} for i, q in enumerate(qs)]
        return questions, {"topic": topic}, mode, ""

    return _start(db, user, "skill", title, title.lower(), settings.skill_minutes, build)


@router.post("/project", status_code=201)
def start_project(body: ProjectStartIn, user: User = Depends(require_candidate), db: Session = Depends(get_db)):
    try:
        key = normalise_repo_key(body.url)
    except SourceRejected as exc:
        raise HTTPException(422, str(exc))

    def build():
        try:
            repo = inspect_repo(body.url, user.github_username)
        except SourceRejected as exc:
            raise HTTPException(422, str(exc))
        material = (f"Candidate's architecture abstract:\n{body.abstract}\n\nRepository description: {repo['description']}\n"
                    f"Languages: {', '.join(repo['languages'])}\n\nREADME:\n{repo['readme']}")
        qs, mode = grading.defense_questions("project", body.title, material)
        context = {"url": f"github.com/{key}", "summary": body.abstract[:400],
                   "tech": repo["languages"] or [], "repo": {k: repo[k] for k in ("status", "ownership", "owner", "stars") if k in repo}}
        return qs, context, mode, material

    return _start(db, user, "project", body.title.strip(), key, settings.defense_minutes, build)


@router.post("/paper", status_code=201)
async def start_paper(
    title: str = Form(..., max_length=300),
    doi: str = Form(""),
    abstract: str = Form("", max_length=6000),
    pdf: UploadFile | None = File(default=None),
    user: User = Depends(require_candidate),
    db: Session = Depends(get_db),
):
    pdf_bytes = await pdf.read() if pdf and pdf.filename else b""
    if len(pdf_bytes) > 10 * 1024 * 1024:
        raise HTTPException(413, "PDF too large (10 MB max)")
    if not doi.strip() and not pdf_bytes:
        raise HTTPException(422, "Provide a DOI and/or upload the paper as a PDF.")
    if len(abstract.strip()) < 20 and not pdf_bytes:
        raise HTTPException(422, "Paste the abstract/methodology (20+ characters) or upload the PDF.")
    try:
        doi_norm = normalise_doi(doi) if doi.strip() else None
    except SourceRejected as exc:
        raise HTTPException(422, str(exc))
    key = doi_norm or title.strip().lower()

    def build():
        try:
            meta = inspect_doi(doi_norm, user.name) if doi_norm else {"status": "no-doi", "authors": [], "abstract": "", "journal": ""}
            pdf_text = extract_pdf_text(pdf_bytes) if pdf_bytes else ""
        except SourceRejected as exc:
            raise HTTPException(422, str(exc))
        material = (f"Candidate's methodology abstract:\n{abstract}\n\nPublished abstract: {meta['abstract']}\n\nPaper text:\n{pdf_text}")
        qs, mode = grading.defense_questions("paper", title, material)
        context = {"doi": doi_norm, "journal": meta.get("journal", ""), "authors": meta.get("authors", []),
                   "doi_status": meta["status"], "summary": (abstract or meta["abstract"] or pdf_text)[:400]}
        return qs, context, mode, material

    return _start(db, user, "paper", title.strip(), key, settings.defense_minutes, build)


# ------------------------------------------------------------------ lifecycle
@router.get("/{assessment_id}")
def get_assessment(assessment_id: str, user: User = Depends(require_candidate), db: Session = Depends(get_db)):
    _reap(db, user)
    return _view(_get_own(db, user, assessment_id))


@router.post("/{assessment_id}/begin")
def begin(assessment_id: str, body: BeginIn, user: User = Depends(require_candidate), db: Session = Depends(get_db)):
    _reap(db, user)
    a = _get_own(db, user, assessment_id)
    if a.status == "active":  # idempotent: resume after a refresh
        a.events = [*a.events, {"t": utcnow().isoformat(), "type": "session_resumed", "counted": False}]
        db.commit()
        return _view(a)
    if a.status != "pending":
        raise HTTPException(409, f"This test is already {a.status}.")
    if settings.require_camera and not body.camera_ok:
        raise HTTPException(400, "Camera access is required to take this proctored test.")
    now = utcnow()
    a.status, a.started_at, a.deadline, a.camera_ok = "active", now, now + timedelta(seconds=a.duration_seconds), body.camera_ok
    db.commit()
    return _view(a)


@router.post("/{assessment_id}/events")
def record_event(assessment_id: str, body: EventIn, user: User = Depends(require_candidate), db: Session = Depends(get_db)):
    a = _get_own(db, user, assessment_id)
    if a.status != "active":
        return {"status": a.status, "violation_count": a.violation_count, "max_violations": settings.max_violations}
    if body.type not in VIOLATION_TYPES and body.type not in INFO_TYPES:
        raise HTTPException(422, "Unknown event type")

    now = utcnow()
    counted = False
    if body.type in VIOLATION_TYPES:
        last = next((e for e in reversed(a.events) if e.get("counted")), None)
        recent = last and (now - _parse(last["t"])).total_seconds() < MERGE_WINDOW_SECONDS
        counted = not recent
    a.events = [*a.events, {"t": now.isoformat(), "type": body.type, "detail": body.detail, "counted": counted}]
    if counted:
        a.violation_count += 1
    if a.violation_count > settings.max_violations:
        _finish(a, "invalidated", 0, 0, {
            "passed": False, "score": 0, "violations": a.violation_count,
            "message": "Test invalidated: too many proctoring violations.",
            "retry_after_seconds": settings.cooldown_minutes * 60}, now)
    db.commit()
    return {"status": a.status, "violation_count": a.violation_count, "max_violations": settings.max_violations}


def _parse(ts: str):
    from datetime import datetime
    return datetime.fromisoformat(ts)


@router.post("/{assessment_id}/submit")
def submit(assessment_id: str, body: SubmitIn, user: User = Depends(require_candidate), db: Session = Depends(get_db)):
    a = _get_own(db, user, assessment_id)
    if a.status == "active" and a.deadline and utcnow() > a.deadline + timedelta(seconds=settings.submit_grace_seconds):
        _reap(db, user)
    if a.status != "active":
        if a.result:
            return {"status": a.status, **a.result}
        raise HTTPException(409, f"This test is {a.status} and cannot be submitted.")

    questions = a.payload["questions"]
    feedback: list[dict] = []
    if a.kind == "skill":
        per_q = [100 if body.answers.get(q["id"]) == q["correct"] else 0 for q in questions]
        mode = a.grading_mode or "bank"
    else:
        graded, mode = grading.grade_text_answers(a.kind, a.title, a.payload.get("material", ""), questions, body.answers)
        per_q = [g["score"] for g in graded]
        feedback = [{"id": q["id"], "score": g["score"], "feedback": g["feedback"]} for q, g in zip(questions, graded)]

    raw = round(sum(per_q) / max(1, len(per_q)))
    penalty = min(raw, a.violation_count * settings.violation_penalty)
    final = raw - penalty
    passed = final >= settings.pass_score
    rating = _rating(final) if passed else None

    result = {"passed": passed, "score": final, "raw_score": raw, "penalty": penalty, "violations": a.violation_count,
              "rating": rating, "grading_mode": mode, "feedback": feedback,
              "message": "Verified!" if passed else f"Score below the {settings.pass_score}% pass mark."}
    a.grading_mode = mode

    if passed:
        cred = _award(db, user, a, final, rating, mode)
        result["credential_id"] = cred.id
    else:
        result["retry_after_seconds"] = settings.cooldown_minutes * 60

    _finish(a, "passed" if passed else "failed", raw, final, result)
    db.commit()
    return {"status": a.status, **result}


def _award(db: Session, user: User, a: Assessment, score: int, rating: str, mode: str) -> Credential:
    """Create (or refresh) the signed credential for a passed assessment."""
    ctx = a.context or {}
    data = {"grading_mode": mode, **{k: v for k, v in ctx.items() if k not in ("url", "topic")}}
    cred = db.query(Credential).filter_by(user_id=user.id, kind=a.kind, key=a.key).first()
    if not cred:
        cred = Credential(id=new_id(), user_id=user.id, kind=a.kind, key=a.key, title=a.title, score=score, rating=rating,
                          verified_at=utcnow(), signature="")
        db.add(cred)
    cred.title, cred.score, cred.rating, cred.url = a.title, score, rating, ctx.get("url")
    cred.data, cred.verified_at, cred.assessment_id = data, utcnow(), a.id
    cred.signature = sign_credential(cred)
    return cred
