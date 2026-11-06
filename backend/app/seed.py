"""Demo data (accounts, credentials, jobs). Disable with SEED_DEMO=0.

Seeded credentials are flagged `demo_seed` and are NOT the result of a real assessment — the UI labels them.
All demo accounts use the password  demo1234 .
"""
from datetime import datetime

from sqlalchemy.orm import Session

from .models import Credential, Job, User, new_id
from .security import hash_password, sign_credential

PASSWORD = "demo1234"


def _cred(user_id, kind, title, score, rating, verified, url=None, **data):
    c = Credential(id=new_id(), user_id=user_id, kind=kind, key=title.lower() if kind != "project" else (url or title).lower(),
                   title=title, url=url, score=score, rating=rating,
                   verified_at=datetime.fromisoformat(verified), data={"grading_mode": "demo", "demo_seed": True, **data},
                   signature="")
    c.signature = sign_credential(c)
    return c


def seed(db: Session) -> None:
    if db.query(User).count():
        return
    pw = hash_password(PASSWORD)

    candidates = [
        (User(email="alex@demo.dev", name="Alex Rivera", role="candidate", password_hash=pw, github_username="arivera",
              title="Senior Full Stack & AI Engineer",
              bio="Specialized in high-throughput distributed systems and transformer optimizations."),
         [("skill", "Python", 94, "Expert", "2026-10-12", None, {}),
          ("skill", "React", 91, "Expert", "2026-09-28", None, {}),
          ("skill", "Machine Learning", 85, "Expert", "2026-10-01", None, {}),
          ("project", "Distributed Vector Indexer", 96, "Expert", "2026-10-05", "github.com/arivera/vector-index-core",
           {"tech": ["C++", "Python", "gRPC"], "summary": "Lock-free concurrent vector database indexing engine."}),
          ("paper", "Sub-linear Attention Mechanisms for Edge Devices", 92, "Expert", "2026-09-20", None,
           {"doi": "10.0000/demo.alex", "journal": "NeurIPS 2025 Workshop",
            "summary": "Approximated attention matrices using dynamic quantised low-rank projections."})]),
        (User(email="sarah@demo.dev", name="Dr. Sarah Chen", role="candidate", password_hash=pw, github_username="schen",
              title="Research Scientist & ML Specialist",
              bio="Focusing on LLM security, model alignment, and automated code synthesis defense."),
         [("skill", "Python", 98, "Expert", "2026-08-15", None, {}),
          ("skill", "Rust", 95, "Expert", "2026-11-01", None, {}),
          ("skill", "Machine Learning", 97, "Expert", "2026-10-19", None, {}),
          ("project", "Rust-based LLM Guardrail Engine", 95, "Expert", "2026-10-02", "github.com/schen/guardrail-rs",
           {"tech": ["Rust", "ONNX Runtime"], "summary": "Sub-millisecond prompt injection detection library in memory-safe Rust."}),
          ("paper", "Formal Verification of Neural Network Alignment Bounds", 99, "Expert", "2026-09-11", None,
           {"doi": "10.0000/demo.sarah", "journal": "Journal of AI Safety & Logic",
            "summary": "Mathematical framework to guarantee bounded constraints in non-linear models."})]),
        (User(email="marcus@demo.dev", name="Marcus Vance", role="candidate", password_hash=pw, github_username="mvance",
              title="Backend Systems Architect",
              bio="Building resilient cloud architecture and high-availability database infrastructure."),
         [("skill", "Go", 90, "Expert", "2026-09-04", None, {}),
          ("skill", "SQL", 84, "Intermediate", "2026-07-22", None, {}),
          ("skill", "Docker / Kubernetes", 92, "Expert", "2026-10-25", None, {}),
          ("project", "Raft Consensus Protocol Engine", 89, "Expert", "2026-09-30", "github.com/mvance/raft-go-impl",
           {"tech": ["Go", "Protobuf"], "summary": "Lightweight Raft implementation designed for low-latency IoT clusters."})]),
    ]
    for user, creds in candidates:
        db.add(user)
        db.flush()
        for kind, title, score, rating, when, url, data in creds:
            db.add(_cred(user.id, kind, title, score, rating, when, url, **data))

    r1 = User(email="recruiter@neuralscale.dev", name="Priya Nair", role="recruiter", password_hash=pw,
              company_name="NeuralScale AI", title="Head of Talent")
    r2 = User(email="recruiter@hypercloud.dev", name="Tom Becker", role="recruiter", password_hash=pw,
              company_name="HyperCloud Infra", title="Engineering Manager")
    db.add_all([r1, r2])
    db.flush()
    db.add_all([
        Job(recruiter_id=r1.id, company="NeuralScale AI", title="Lead AI Systems Engineer", location="San Francisco, CA / Remote",
            salary="$190,000 - $240,000", required_skills=["Python", "PyTorch", "Rust"], skill_weight=40, code_weight=35,
            paper_weight=25, description="Deep learning model optimization, transformer inference engines and verified "
                                         "code repositories in Python and Rust."),
        Job(recruiter_id=r2.id, company="HyperCloud Infra", title="Senior Distributed Systems Architect",
            location="New York, NY / Hybrid", salary="$180,000 - $220,000",
            required_skills=["Go", "Docker / Kubernetes", "SQL"], skill_weight=50, code_weight=40, paper_weight=10,
            description="Building next-gen fault tolerant cloud infrastructure: Raft and distributed consensus, "
                        "Kubernetes operators and PostgreSQL high availability."),
    ])
    db.commit()
