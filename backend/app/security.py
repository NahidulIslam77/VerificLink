import hashlib
import hmac
import secrets
from datetime import timedelta

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import Credential, User, utcnow

_bearer = HTTPBearer(auto_error=False)
_PBKDF2_ROUNDS = 200_000


# ---------- passwords ----------
def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), _PBKDF2_ROUNDS).hex()
    return f"pbkdf2${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt, digest = stored.split("$")
    except ValueError:
        return False
    check = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), _PBKDF2_ROUNDS).hex()
    return hmac.compare_digest(check, digest)


# ---------- JWT ----------
def create_token(user: User) -> str:
    payload = {"sub": str(user.id), "role": user.role, "exp": utcnow() + timedelta(hours=settings.token_hours)}
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer), db: Session = Depends(get_db)
) -> User:
    if not creds:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        data = jwt.decode(creds.credentials, settings.secret_key, algorithms=["HS256"])
        user = db.get(User, int(data["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User no longer exists")
    return user


def require_candidate(user: User = Depends(current_user)) -> User:
    if user.role != "candidate":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Candidate account required")
    return user


def require_recruiter(user: User = Depends(current_user)) -> User:
    if user.role != "recruiter":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Recruiter account required")
    return user


# ---------- credential signatures (tamper evidence) ----------
def _signing_string(c: Credential) -> str:
    return "|".join(
        [c.id, str(c.user_id), c.kind, c.key, str(c.score), c.rating, c.verified_at.strftime("%Y-%m-%dT%H:%M:%S")]
    )


def sign_credential(c: Credential) -> str:
    return hmac.new(settings.secret_key.encode(), _signing_string(c).encode(), hashlib.sha256).hexdigest()


def signature_valid(c: Credential) -> bool:
    return hmac.compare_digest(sign_credential(c), c.signature or "")
