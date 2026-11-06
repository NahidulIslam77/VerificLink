"""Candidate <-> job matching.

Match Score = ( w_s * SkillScore + w_c * CodeAlignment + w_r * ResearchRelevance ) / (w_s + w_c + w_r)

* SkillScore        mean verified score over the job's required skills (0 for a skill the candidate hasn't verified)
* CodeAlignment     best defended project:  0.65 * defense score + 35 * semantic relevance to the job
* ResearchRelevance best defended paper:    same formula
* semantic relevance = TF-IDF cosine similarity between the job text and the credential text, scaled to 0..1.
  (Pure-Python stand-in for vector embeddings; swap `semantic_similarities` for pgvector/Qdrant at scale.)

Only verified credentials exist in the database, so nothing unverified can influence a score.
"""
import math
import re
from collections import Counter

from .models import Credential, Job
from .questions import canonical_topic

_TOKEN = re.compile(r"[a-z][a-z0-9+#.]{1,}")
_STOP = set("the a an and or of to in on for with is are be this that it as by from at into we our using use based".split())


def _tokens(text: str) -> list[str]:
    return [t for t in _TOKEN.findall(text.lower()) if t not in _STOP]


def semantic_similarities(query: str, docs: list[str]) -> list[float]:
    """TF-IDF cosine similarity of `query` against each doc, in [0, 1]."""
    corpus = [_tokens(query)] + [_tokens(d) for d in docs]
    n = len(corpus)
    df = Counter(t for toks in corpus for t in set(toks))
    idf = {t: math.log((n + 1) / (c + 1)) + 1 for t, c in df.items()}

    def vec(toks: list[str]) -> dict[str, float]:
        tf = Counter(toks)
        return {t: (1 + math.log(c)) * idf[t] for t, c in tf.items()}

    def cos(a: dict, b: dict) -> float:
        dot = sum(v * b.get(t, 0.0) for t, v in a.items())
        na, nb = math.sqrt(sum(v * v for v in a.values())), math.sqrt(sum(v * v for v in b.values()))
        return dot / (na * nb) if na and nb else 0.0

    q = vec(corpus[0])
    return [cos(q, vec(toks)) for toks in corpus[1:]]


def job_text(job: Job) -> str:
    return f"{job.title} {job.description} {' '.join(job.required_skills or [])}"


def credential_text(c: Credential) -> str:
    d = c.data or {}
    return f"{c.title} {d.get('summary', '')} {' '.join(d.get('tech', []) or [])} {d.get('journal', '')}"


def skill_matches(required: str, have: str) -> bool:
    a, b = canonical_topic(required), canonical_topic(have)
    if a and b:
        return a == b
    return required.strip().lower() == have.strip().lower()


def score_candidate(job: Job, creds: list[Credential]) -> dict:
    skills = [c for c in creds if c.kind == "skill"]
    projects = [c for c in creds if c.kind == "project"]
    papers = [c for c in creds if c.kind == "paper"]

    # 1. verified skills
    matched, missing, per_skill = [], [], []
    if job.required_skills:
        for req in job.required_skills:
            hit = max((s for s in skills if skill_matches(req, s.title)), key=lambda s: s.score, default=None)
            if hit:
                matched.append(req)
                per_skill.append(hit.score)
            else:
                missing.append(req)
                per_skill.append(0)
        skill_score = sum(per_skill) / len(per_skill)
    else:
        skill_score = sum(s.score for s in skills) / len(skills) if skills else 0.0

    # 2 & 3. semantic alignment of defended work with the job text
    jt = job_text(job)

    def best(items: list[Credential]) -> float:
        if not items:
            return 0.0
        sims = semantic_similarities(jt, [credential_text(c) for c in items])
        return max(0.65 * c.score + 35 * min(1.0, s * 3) for c, s in zip(items, sims))

    code_score, research_score = best(projects), best(papers)

    weights = (job.skill_weight, job.code_weight, job.paper_weight)
    total_w = sum(weights) or 1
    total = (skill_score * weights[0] + code_score * weights[1] + research_score * weights[2]) / total_w
    return {
        "score": round(total),
        "breakdown": {"skills": round(skill_score), "code": round(code_score), "research": round(research_score)},
        "matched_skills": matched,
        "missing_skills": missing,
    }
