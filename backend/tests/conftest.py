import os
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["SEED_DEMO"] = "1"
os.environ["REQUIRE_CAMERA"] = "1"
os.environ["COOLDOWN_MINUTES"] = "30"
os.environ["MAX_VIOLATIONS"] = "4"
os.environ.pop("ANTHROPIC_API_KEY", None)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


def _auth(client, email, password="demo1234"):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="session")
def make_user(client):
    counter = {"n": 0}

    def _make(role="candidate", **extra):
        counter["n"] += 1
        email = f"user{counter['n']}@test.dev"
        body = {"email": email, "password": "password123", "name": extra.pop("name", f"Test User {counter['n']}"), "role": role, **extra}
        r = client.post("/api/auth/register", json=body)
        assert r.status_code == 201, r.text
        return {"Authorization": f"Bearer {r.json()['token']}"}, r.json()["user"]

    return _make


@pytest.fixture
def auth():
    return _auth
