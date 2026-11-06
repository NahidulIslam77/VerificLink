from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..matching import score_candidate
from ..models import Application, Credential, Job, User
from ..schemas import JobIn
from ..security import current_user, require_candidate, require_recruiter
from ..serializers import credential_out

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


def job_out(j: Job) -> dict:
    return {
        "id": j.id, "recruiter_id": j.recruiter_id, "company": j.company, "title": j.title, "location": j.location,
        "type": j.type, "salary": j.salary, "description": j.description, "required_skills": j.required_skills,
        "skill_weight": j.skill_weight, "code_weight": j.code_weight, "paper_weight": j.paper_weight,
        "created_at": j.created_at.isoformat() + "Z",
    }


def _creds_by_user(db: Session) -> dict[int, list[Credential]]:
    out: dict[int, list[Credential]] = {}
    for c in db.query(Credential).all():
        out.setdefault(c.user_id, []).append(c)
    return out


@router.get("")
def list_jobs(mine: bool = False, user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = db.query(Job).order_by(Job.created_at.desc())
    if mine and user.role == "recruiter":
        q = q.filter(Job.recruiter_id == user.id)
    jobs = q.all()
    if user.role != "candidate":
        counts = {j.id: db.query(Application).filter(Application.job_id == j.id).count() for j in jobs}
        return [{**job_out(j), "applicant_count": counts[j.id]} for j in jobs]

    my_creds = db.query(Credential).filter(Credential.user_id == user.id).all()
    applied = {a.job_id for a in db.query(Application).filter(Application.candidate_id == user.id).all()}
    return [{**job_out(j), "match": score_candidate(j, my_creds), "applied": j.id in applied} for j in jobs]


@router.post("", status_code=201)
def create_job(body: JobIn, user: User = Depends(require_recruiter), db: Session = Depends(get_db)):
    if body.skill_weight + body.code_weight + body.paper_weight <= 0:
        raise HTTPException(422, "At least one scoring weight must be above zero")
    data = body.model_dump()
    data["company"] = (data["company"] or user.company_name or user.name).strip()
    job = Job(recruiter_id=user.id, **data)
    db.add(job)
    db.commit()
    return job_out(job)


def _own_job(db: Session, user: User, job_id: int) -> Job:
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.recruiter_id != user.id:
        raise HTTPException(403, "This job belongs to another recruiter")
    return job


@router.delete("/{job_id}", status_code=204)
def delete_job(job_id: int, user: User = Depends(require_recruiter), db: Session = Depends(get_db)):
    job = _own_job(db, user, job_id)
    db.query(Application).filter(Application.job_id == job.id).delete()
    db.delete(job)
    db.commit()


@router.get("/{job_id}/matches")
def matches(job_id: int, user: User = Depends(require_recruiter), db: Session = Depends(get_db)):
    """Verified candidates ranked by match score. Candidates with no verified credentials are excluded."""
    job = _own_job(db, user, job_id)
    applied = {a.candidate_id for a in db.query(Application).filter(Application.job_id == job.id).all()}
    by_user = _creds_by_user(db)
    out = []
    for cand in db.query(User).filter(User.role == "candidate").all():
        creds = by_user.get(cand.id, [])
        if not creds:
            continue
        out.append({
            "candidate": {"id": cand.id, "name": cand.name, "title": cand.title, "bio": cand.bio},
            "match": score_candidate(job, creds),
            "applied": cand.id in applied,
            "counts": {k: sum(1 for c in creds if c.kind == k) for k in ("skill", "project", "paper")},
            "top_credentials": [credential_out(c) for c in sorted(creds, key=lambda c: -c.score)[:3]],
        })
    out.sort(key=lambda r: (-r["match"]["score"], not r["applied"]))
    return {"job": job_out(job), "matches": out}


@router.post("/{job_id}/apply", status_code=201)
def apply(job_id: int, user: User = Depends(require_candidate), db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if not db.query(Credential).filter(Credential.user_id == user.id).first():
        raise HTTPException(403, "Earn at least one verified credential before applying — only verified proof is accepted.")
    if db.query(Application).filter_by(job_id=job_id, candidate_id=user.id).first():
        raise HTTPException(409, "You already applied to this job")
    db.add(Application(job_id=job_id, candidate_id=user.id))
    db.commit()
    return {"applied": True}
