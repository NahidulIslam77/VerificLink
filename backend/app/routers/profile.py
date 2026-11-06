from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Credential, User
from ..schemas import ProfileUpdate
from ..security import current_user, signature_valid
from ..serializers import profile_out

router = APIRouter(prefix="/api", tags=["profile"])


def _creds(db: Session, user_id: int) -> list[Credential]:
    return db.query(Credential).filter(Credential.user_id == user_id).all()


@router.get("/profile/me")
def my_profile(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return profile_out(user, _creds(db, user.id))


@router.patch("/profile/me")
def update_profile(body: ProfileUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)
    if "github_username" in data and data["github_username"]:
        data["github_username"] = data["github_username"].strip().lstrip("@")
    for field, value in data.items():
        if field == "company_name" and user.role != "recruiter":
            continue
        setattr(user, field, value.strip() if isinstance(value, str) else value)
    db.commit()
    return profile_out(user, _creds(db, user.id))


@router.get("/candidates/{candidate_id}")
def candidate_profile(candidate_id: int, viewer: User = Depends(current_user), db: Session = Depends(get_db)):
    """Recruiters (and the candidate themselves) can inspect verified proof."""
    cand = db.get(User, candidate_id)
    if not cand or cand.role != "candidate":
        raise HTTPException(404, "Candidate not found")
    if viewer.role != "recruiter" and viewer.id != cand.id:
        raise HTTPException(403, "Not allowed")
    return profile_out(cand, _creds(db, cand.id), include_email=viewer.role == "recruiter" or viewer.id == cand.id)


@router.get("/verify/{credential_id}")
def verify_credential(credential_id: str, db: Session = Depends(get_db)):
    """Public endpoint: anyone can confirm a badge is genuine and untampered."""
    c = db.get(Credential, credential_id)
    if not c:
        raise HTTPException(404, "No credential with that ID")
    holder = db.get(User, c.user_id)
    return {
        "valid": signature_valid(c),
        "credential_id": c.id,
        "kind": c.kind,
        "title": c.title,
        "score": c.score,
        "rating": c.rating,
        "holder": holder.name if holder else None,
        "verified_at": c.verified_at.isoformat() + "Z",
        "grading_mode": (c.data or {}).get("grading_mode"),
        "demo_seed": bool((c.data or {}).get("demo_seed")),
    }
