from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import LoginIn, RegisterIn
from ..security import create_token, current_user, hash_password, verify_password
from ..serializers import user_out

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    if body.role == "recruiter" and not (body.company_name or "").strip():
        raise HTTPException(422, "Company name is required for recruiter accounts")
    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        name=body.name.strip(),
        role=body.role,
        company_name=(body.company_name or "").strip() or None,
        github_username=(body.github_username or "").strip().lstrip("@") or None,
        title="Hiring team" if body.role == "recruiter" else "",
    )
    db.add(user)
    db.commit()
    return {"token": create_token(user), "user": user_out(user)}


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.strip().lower()).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    return {"token": create_token(user), "user": user_out(user)}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return user_out(user)
