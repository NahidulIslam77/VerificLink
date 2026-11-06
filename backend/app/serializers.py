from .models import Credential, User
from .security import signature_valid


def credential_out(c: Credential) -> dict:
    return {
        "id": c.id,
        "kind": c.kind,
        "title": c.title,
        "url": c.url,
        "score": c.score,
        "rating": c.rating,
        "data": c.data or {},
        "verified_at": c.verified_at.isoformat() + "Z",
        "signature_valid": signature_valid(c),
    }


def user_out(u: User) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "name": u.name,
        "role": u.role,
        "title": u.title,
        "bio": u.bio,
        "github_username": u.github_username,
        "company_name": u.company_name,
    }


def profile_out(u: User, creds: list[Credential], include_email: bool = True) -> dict:
    base = user_out(u)
    if not include_email:
        base.pop("email")
    creds = sorted(creds, key=lambda c: c.verified_at, reverse=True)
    return {
        **base,
        "skills": [credential_out(c) for c in creds if c.kind == "skill"],
        "projects": [credential_out(c) for c in creds if c.kind == "project"],
        "papers": [credential_out(c) for c in creds if c.kind == "paper"],
    }
