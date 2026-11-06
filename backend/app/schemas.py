import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class RegisterIn(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=120)
    role: Literal["candidate", "recruiter"] = "candidate"
    company_name: str | None = Field(default=None, max_length=160)
    github_username: str | None = Field(default=None, max_length=80)

    @field_validator("email")
    @classmethod
    def _email_ok(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL.match(v):
            raise ValueError("Invalid email address")
        return v


class LoginIn(BaseModel):
    email: str
    password: str


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    title: str | None = Field(default=None, max_length=160)
    bio: str | None = Field(default=None, max_length=2000)
    github_username: str | None = Field(default=None, max_length=80)
    company_name: str | None = Field(default=None, max_length=160)


class SkillStartIn(BaseModel):
    skill: str = Field(min_length=1, max_length=80)


class ProjectStartIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    url: str = Field(min_length=3, max_length=300)
    abstract: str = Field(min_length=20, max_length=6000)


class BeginIn(BaseModel):
    camera_ok: bool = False


class EventIn(BaseModel):
    type: str = Field(max_length=40)
    detail: str | None = Field(default=None, max_length=200)


class SubmitIn(BaseModel):
    answers: dict[str, int | str] = {}


class JobIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    company: str | None = Field(default=None, max_length=160)
    location: str = Field(default="Remote", max_length=160)
    type: str = Field(default="Full-time", max_length=40)
    salary: str = Field(default="", max_length=80)
    description: str = Field(default="", max_length=6000)
    required_skills: list[str] = Field(default_factory=list, max_length=20)
    skill_weight: int = Field(default=40, ge=0, le=100)
    code_weight: int = Field(default=40, ge=0, le=100)
    paper_weight: int = Field(default=20, ge=0, le=100)

    @field_validator("required_skills")
    @classmethod
    def _clean_skills(cls, v: list[str]) -> list[str]:
        return [s.strip() for s in v if s and s.strip()]
