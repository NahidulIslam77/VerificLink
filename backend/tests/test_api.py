from datetime import timedelta

import pytest

from app import sources
from app.database import SessionLocal
from app.models import Assessment, Credential, utcnow


def _payload(aid):
    with SessionLocal() as db:
        return db.get(Assessment, aid).payload


def _start_and_begin(client, h, skill="Python"):
    r = client.post("/api/assessments/skill", json={"skill": skill}, headers=h)
    assert r.status_code == 201, r.text
    aid = r.json()["id"]
    b = client.post(f"/api/assessments/{aid}/begin", json={"camera_ok": True}, headers=h)
    assert b.status_code == 200, b.text
    return aid, b.json()


def _correct_answers(aid):
    return {q["id"]: q["correct"] for q in _payload(aid)["questions"]}


# ---------------------------------------------------------------- auth
def test_register_login_and_roles(client, make_user):
    h, user = make_user("candidate")
    assert client.get("/api/auth/me", headers=h).json()["email"] == user["email"]
    assert client.post("/api/auth/register", json={"email": user["email"], "password": "password123", "name": "x"}).status_code == 409
    assert client.post("/api/auth/login", json={"email": user["email"], "password": "wrong-pass"}).status_code == 401
    assert client.post("/api/auth/register", json={"email": "r@x.dev", "password": "password123", "name": "R", "role": "recruiter"}).status_code == 422
    assert client.get("/api/auth/me").status_code == 401
    rh, _ = make_user("recruiter", company_name="Acme")
    assert client.post("/api/assessments/skill", json={"skill": "Python"}, headers=rh).status_code == 403
    assert client.post("/api/jobs", json={"title": "Eng"}, headers=h).status_code == 403


# ---------------------------------------------------------------- skill audit
def test_skill_audit_full_flow_and_verification(client, make_user):
    h, _ = make_user()
    aid, view = _start_and_begin(client, h)
    assert len(view["questions"]) == 5
    assert all("correct" not in q for q in view["questions"])           # answers never leave the server
    assert view["remaining_seconds"] <= 15 * 60

    res = client.post(f"/api/assessments/{aid}/submit", json={"answers": _correct_answers(aid)}, headers=h).json()
    assert res["passed"] and res["score"] == 100 and res["rating"] == "Expert"

    prof = client.get("/api/profile/me", headers=h).json()
    assert prof["skills"][0]["title"] == "Python" and prof["skills"][0]["signature_valid"]

    v = client.get(f"/api/verify/{res['credential_id']}").json()          # public
    assert v["valid"] and v["rating"] == "Expert"

    # tampering with the stored score breaks the signature
    with SessionLocal() as db:
        c = db.get(Credential, res["credential_id"])
        c.score = 100 if c.score != 100 else 99
        db.commit()
    assert client.get(f"/api/verify/{res['credential_id']}").json()["valid"] is False


def test_camera_required_to_begin(client, make_user):
    h, _ = make_user()
    aid = client.post("/api/assessments/skill", json={"skill": "Go"}, headers=h).json()["id"]
    assert client.post(f"/api/assessments/{aid}/begin", json={"camera_ok": False}, headers=h).status_code == 400
    assert client.post(f"/api/assessments/{aid}/begin", json={"camera_ok": True}, headers=h).status_code == 200


def test_fail_triggers_cooldown(client, make_user):
    h, _ = make_user()
    aid, _ = _start_and_begin(client, h, "Rust")
    res = client.post(f"/api/assessments/{aid}/submit", json={"answers": {}}, headers=h).json()
    assert not res["passed"] and res["score"] == 0
    r = client.post("/api/assessments/skill", json={"skill": "Rust"}, headers=h)
    assert r.status_code == 429 and r.json()["detail"]["retry_after_seconds"] > 0
    # a different skill is not blocked
    assert client.post("/api/assessments/skill", json={"skill": "SQL"}, headers=h).status_code == 201


def test_violations_penalty_merge_and_invalidation(client, make_user):
    h, _ = make_user()
    aid, _ = _start_and_begin(client, h)
    ev = lambda t: client.post(f"/api/assessments/{aid}/events", json={"type": t}, headers=h).json()  # noqa: E731
    assert ev("tab_hidden")["violation_count"] == 1
    assert ev("window_blur")["violation_count"] == 1                    # fired together -> merged
    assert ev("fullscreen_enter")["violation_count"] == 1               # informational
    assert client.post(f"/api/assessments/{aid}/events", json={"type": "bogus"}, headers=h).status_code == 422
    with SessionLocal() as db:                                           # age the last violation past the merge window
        a = db.get(Assessment, aid)
        a.events = [{**e, "t": (utcnow() - timedelta(seconds=10)).isoformat()} for e in a.events]
        db.commit()
    assert ev("paste")["violation_count"] == 2
    res = client.post(f"/api/assessments/{aid}/submit", json={"answers": _correct_answers(aid)}, headers=h).json()
    assert res["raw_score"] == 100 and res["penalty"] == 10 and res["score"] == 90 and res["rating"] == "Expert"

    # invalidation after MAX_VIOLATIONS (=4 in tests)
    h2, _ = make_user()
    aid2, _ = _start_and_begin(client, h2, "Algorithms")
    for _i in range(6):
        with SessionLocal() as db:
            a = db.get(Assessment, aid2)
            a.events = [{**e, "t": (utcnow() - timedelta(seconds=10)).isoformat()} for e in a.events]
            db.commit()
        out = client.post(f"/api/assessments/{aid2}/events", json={"type": "tab_hidden"}, headers=h2).json()
        if out["status"] == "invalidated":
            break
    assert out["status"] == "invalidated"
    sub = client.post(f"/api/assessments/{aid2}/submit", json={"answers": _correct_answers(aid2)}, headers=h2).json()
    assert sub["passed"] is False


def test_late_submission_expires(client, make_user):
    h, _ = make_user()
    aid, _ = _start_and_begin(client, h, "TypeScript")
    with SessionLocal() as db:
        a = db.get(Assessment, aid)
        a.deadline = utcnow() - timedelta(minutes=5)
        db.commit()
    res = client.post(f"/api/assessments/{aid}/submit", json={"answers": _correct_answers(aid)}, headers=h).json()
    assert res["status"] == "expired" and res["passed"] is False


def test_unsupported_skill_is_rejected_honestly(client, make_user):
    h, _ = make_user()
    r = client.post("/api/assessments/skill", json={"skill": "Underwater Basket Weaving"}, headers=h)
    assert r.status_code == 422 and "Python" in r.json()["detail"]["available"]


def test_resume_active_assessment(client, make_user):
    h, _ = make_user()
    aid, v1 = _start_and_begin(client, h, "React")
    again = client.post("/api/assessments/skill", json={"skill": "react"}, headers=h).json()
    assert again["id"] == aid and again["status"] == "active"
    assert client.post(f"/api/assessments/{aid}/begin", json={"camera_ok": True}, headers=h).json()["questions"] == v1["questions"]


# ---------------------------------------------------------------- project / paper defense
def test_project_defense_heuristic_flow(client, make_user, monkeypatch):
    h, _ = make_user(github_username="octo")
    monkeypatch.setattr("app.routers.assessments.inspect_repo", lambda url, gh: {
        "status": "verified", "owner": "octo", "description": "A fast cache", "languages": ["Go"],
        "readme": "This cache uses sharded locks and an LRU eviction policy with ttl expiry for latency.",
        "ownership": "owner", "stars": 3})
    body = {"title": "Fast Cache", "url": "https://github.com/octo/fast-cache",
            "abstract": "Sharded LRU cache with ttl expiry designed for low latency lookups under concurrency."}
    r = client.post("/api/assessments/project", json=body, headers=h)
    assert r.status_code == 201, r.text
    aid = r.json()["id"]
    q = client.post(f"/api/assessments/{aid}/begin", json={"camera_ok": True}, headers=h).json()["questions"]
    assert all(x["type"] == "text" and "rubric" not in x for x in q)
    terms = _payload(aid)["questions"][0]["terms"][:6]
    good = " ".join(terms) + " " + "we designed the sharded structure carefully to reduce lock contention and tail latency " * 4
    answers = {x["id"]: good for x in q}
    res = client.post(f"/api/assessments/{aid}/submit", json={"answers": answers}, headers=h).json()
    assert res["passed"] and res["grading_mode"] == "heuristic" and res["score"] <= 80
    prof = client.get("/api/profile/me", headers=h).json()
    assert prof["projects"][0]["title"] == "Fast Cache" and prof["projects"][0]["data"]["repo"]["ownership"] == "owner"

    # a one-word answer set must fail
    aid2 = client.post("/api/assessments/project", json={**body, "title": "Other", "url": "github.com/octo/other"}, headers=h).json()["id"]
    q2 = client.post(f"/api/assessments/{aid2}/begin", json={"camera_ok": True}, headers=h).json()["questions"]
    res2 = client.post(f"/api/assessments/{aid2}/submit", json={"answers": {x["id"]: "dunno" for x in q2}}, headers=h).json()
    assert res2["passed"] is False


def test_project_rejections(client, make_user, monkeypatch):
    h, _ = make_user(github_username="octo")

    def reject(url, gh):
        raise sources.SourceRejected("Forked repositories cannot be submitted.")

    monkeypatch.setattr("app.routers.assessments.inspect_repo", reject)
    r = client.post("/api/assessments/project", json={"title": "Forked", "url": "github.com/x/y", "abstract": "a" * 40}, headers=h)
    assert r.status_code == 422 and "Forked" in r.json()["detail"]
    assert client.post("/api/assessments/project", json={"title": "Bad", "url": "not a url", "abstract": "a" * 40}, headers=h).status_code == 422


def test_paper_defense_with_unavailable_crossref(client, make_user, monkeypatch):
    h, _ = make_user(name="Dr. Jane Doe")
    monkeypatch.setattr("app.routers.assessments.inspect_doi", lambda doi, name: {
        "status": "verified", "doi": doi, "title": "T", "journal": "J. Test", "authors": ["Jane Doe"], "abstract": "graph neural networks for molecules"})
    r = client.post("/api/assessments/paper", data={"title": "GNNs", "doi": "https://doi.org/10.1000/ABC.123", "abstract": "We study graph neural networks for molecular property prediction."}, headers=h)
    assert r.status_code == 201, r.text
    assert client.post("/api/assessments/paper", data={"title": "x", "doi": "nope", "abstract": "a" * 30}, headers=h).status_code == 422
    assert client.post("/api/assessments/paper", data={"title": "x"}, headers=h).status_code == 422


def test_doi_and_repo_parsing():
    assert sources.parse_github_url("https://github.com/Foo/bar.git") == ("Foo", "bar")
    assert sources.parse_github_url("github.com/foo/bar/tree/main") == ("foo", "bar")
    assert sources.normalise_doi("doi:10.1145/3318464.3389700.") == "10.1145/3318464.3389700"
    with pytest.raises(sources.SourceRejected):
        sources.parse_github_url("justaword")


# ---------------------------------------------------------------- jobs & matching
def test_matching_ranks_verified_candidates(client, auth):
    rec = auth(client, "recruiter@neuralscale.dev")
    job1 = client.get("/api/jobs?mine=true", headers=rec).json()[0]
    ranked = client.get(f"/api/jobs/{job1['id']}/matches", headers=rec).json()["matches"]
    assert ranked[0]["candidate"]["name"] == "Dr. Sarah Chen"
    scores = [m["match"]["score"] for m in ranked]
    assert scores == sorted(scores, reverse=True)
    alex = next(m for m in ranked if m["candidate"]["name"] == "Alex Rivera")
    assert "Rust" in alex["match"]["missing_skills"]

    rec2 = auth(client, "recruiter@hypercloud.dev")
    job2 = client.get("/api/jobs?mine=true", headers=rec2).json()[0]
    assert client.get(f"/api/jobs/{job2['id']}/matches", headers=rec2).json()["matches"][0]["candidate"]["name"] == "Marcus Vance"
    assert client.get(f"/api/jobs/{job2['id']}/matches", headers=rec).status_code == 403   # not your job


def test_apply_requires_verified_credential(client, make_user, auth):
    h, _ = make_user()
    job = client.get("/api/jobs", headers=h).json()[0]
    assert "match" in job and job["match"]["score"] == 0
    assert client.post(f"/api/jobs/{job['id']}/apply", headers=h).status_code == 403
    aid, _ = _start_and_begin(client, h, "Go")
    client.post(f"/api/assessments/{aid}/submit", json={"answers": _correct_answers(aid)}, headers=h)
    assert client.post(f"/api/jobs/{job['id']}/apply", headers=h).status_code == 201
    assert client.post(f"/api/jobs/{job['id']}/apply", headers=h).status_code == 409
    assert next(j for j in client.get("/api/jobs", headers=h).json() if j["id"] == job["id"])["applied"] is True


def test_recruiter_creates_job_and_inspects_candidate(client, make_user, auth):
    rh, _ = make_user("recruiter", company_name="Acme Robotics")
    r = client.post("/api/jobs", json={"title": "Go Engineer", "required_skills": ["Go", "SQL"], "skill_weight": 60, "code_weight": 30, "paper_weight": 10}, headers=rh)
    assert r.status_code == 201 and r.json()["company"] == "Acme Robotics"
    assert client.post("/api/jobs", json={"title": "Zero", "skill_weight": 0, "code_weight": 0, "paper_weight": 0}, headers=rh).status_code == 422
    top = client.get(f"/api/jobs/{r.json()['id']}/matches", headers=rh).json()["matches"][0]
    assert top["candidate"]["name"] == "Marcus Vance"
    cand = client.get(f"/api/candidates/{top['candidate']['id']}", headers=rh).json()
    assert cand["projects"] and cand["skills"]
    ch, _ = make_user()
    assert client.get(f"/api/candidates/{top['candidate']['id']}", headers=ch).status_code == 403
    assert client.delete(f"/api/jobs/{r.json()['id']}", headers=rh).status_code == 204
