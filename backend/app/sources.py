"""Checks on the material a candidate wants to defend: GitHub repositories, DOIs (Crossref) and PDF papers.

Network failures are tolerated by default (status "unavailable" is recorded on the credential); set
STRICT_REPO_CHECK=1 to reject instead. Definite problems (forked repo, not an author, bad DOI) always reject.
"""
import io
import re
from collections import Counter

import httpx
from pypdf import PdfReader

from .config import settings

_UA = {"User-Agent": "VerificLink/1.0 (credential verification)"}
_TIMEOUT = httpx.Timeout(8.0)


class SourceRejected(ValueError):
    """The submitted material fails an integrity rule (message is shown to the user)."""


def _gh_headers(accept: str = "application/vnd.github+json") -> dict:
    h = {**_UA, "Accept": accept}
    if settings.github_token:
        h["Authorization"] = f"Bearer {settings.github_token}"
    return h


def parse_github_url(url: str) -> tuple[str, str]:
    s = re.sub(r"^(?:https?://)?(?:www\.)?", "", url.strip().split("?")[0].split("#")[0])
    if s.lower().startswith("github.com"):
        s = s[len("github.com"):].lstrip("/:")
    parts = [p for p in s.split("/") if p]
    if len(parts) < 2 or not all(re.fullmatch(r"[A-Za-z0-9_.-]+", p) for p in parts[:2]):
        raise SourceRejected("Enter a GitHub repository URL like github.com/owner/repo")
    repo = parts[1][:-4] if parts[1].endswith(".git") else parts[1]
    return parts[0], repo


def normalise_repo_key(url: str) -> str:
    owner, repo = parse_github_url(url)
    return f"{owner}/{repo}".lower()


def inspect_repo(url: str, github_username: str | None) -> dict:
    owner, repo = parse_github_url(url)
    if not github_username:
        raise SourceRejected("Add your GitHub username to your profile first so repository ownership can be checked.")
    try:
        with httpx.Client(timeout=_TIMEOUT, headers=_gh_headers()) as c:
            r = c.get(f"https://api.github.com/repos/{owner}/{repo}")
            if r.status_code == 404:
                raise SourceRejected("Repository not found (or it is private).")
            if r.status_code in (403, 429):
                raise httpx.HTTPError("GitHub rate limit")
            r.raise_for_status()
            meta = r.json()
            if meta.get("fork"):
                raise SourceRejected("Forked repositories cannot be submitted. Submit the original work you authored.")

            owned = meta["owner"]["login"].lower() == github_username.lower()
            commits_by_user = None
            if not owned:
                cr = c.get(f"https://api.github.com/repos/{owner}/{repo}/commits",
                           params={"author": github_username, "per_page": 1})
                commits_by_user = len(cr.json()) if cr.status_code == 200 else 0
                if not commits_by_user:
                    raise SourceRejected(
                        f"'{github_username}' is neither the owner nor a commit author of {owner}/{repo}."
                    )
            langs = c.get(f"https://api.github.com/repos/{owner}/{repo}/languages")
            readme = c.get(f"https://api.github.com/repos/{owner}/{repo}/readme",
                           headers=_gh_headers("application/vnd.github.raw+json"))
            return {
                "status": "verified",
                "owner": meta["owner"]["login"],
                "description": meta.get("description") or "",
                "languages": list((langs.json() if langs.status_code == 200 else {}).keys())[:6],
                "readme": readme.text[:6000] if readme.status_code == 200 else "",
                "ownership": "owner" if owned else "contributor",
                "stars": meta.get("stargazers_count", 0),
            }
    except (httpx.HTTPError, ValueError) as exc:
        if isinstance(exc, SourceRejected):
            raise
        if settings.strict_source_check:
            raise SourceRejected("Could not reach GitHub to verify this repository. Try again shortly.")
        return {"status": "unavailable", "owner": owner, "description": "", "languages": [], "readme": "", "ownership": "unchecked"}


_DOI = re.compile(r"10\.\d{4,9}/[^\s]+", re.I)
_TITLES = {"dr", "dr.", "prof", "prof.", "mr", "mr.", "ms", "ms.", "mrs", "mrs.", "phd", "md"}


def normalise_doi(raw: str) -> str:
    m = _DOI.search(raw.strip())
    if not m:
        raise SourceRejected("That doesn't look like a DOI (expected something like 10.1145/3318464.3389700).")
    return m.group(0).rstrip(".,;)").lower()


def inspect_doi(doi_raw: str, candidate_name: str) -> dict:
    doi = normalise_doi(doi_raw)
    try:
        with httpx.Client(timeout=_TIMEOUT, headers=_UA) as c:
            r = c.get(f"https://api.crossref.org/works/{doi}")
            if r.status_code == 404:
                raise SourceRejected("DOI not found in Crossref.")
            r.raise_for_status()
            msg = r.json()["message"]
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        if isinstance(exc, SourceRejected):
            raise
        if settings.strict_source_check:
            raise SourceRejected("Could not reach Crossref to verify this DOI. Try again shortly.")
        return {"status": "unavailable", "doi": doi, "title": "", "journal": "", "authors": [], "abstract": ""}

    authors = [f"{a.get('given', '')} {a.get('family', '')}".strip() for a in msg.get("author", [])]
    parts = [p for p in re.split(r"\s+", candidate_name.lower()) if p not in _TITLES]
    surname = parts[-1] if parts else ""
    if authors and surname and not any(surname == (a.get("family") or "").lower() for a in msg.get("author", [])):
        raise SourceRejected(f"'{candidate_name}' is not listed among the authors of this DOI ({', '.join(authors[:6])}).")
    abstract = re.sub(r"<[^>]+>", " ", msg.get("abstract", "") or "")
    return {
        "status": "verified" if authors else "unverified-authors",
        "doi": doi,
        "title": (msg.get("title") or [""])[0],
        "journal": (msg.get("container-title") or [""])[0],
        "authors": authors[:20],
        "abstract": re.sub(r"\s+", " ", abstract).strip()[:3000],
    }


def extract_pdf_text(data: bytes, max_chars: int = 8000) -> str:
    try:
        reader = PdfReader(io.BytesIO(data))
        text = "\n".join((p.extract_text() or "") for p in reader.pages[:10])
    except Exception:
        raise SourceRejected("Could not read that PDF. Upload a text-based PDF or paste the abstract instead.")
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) < 200:
        raise SourceRejected("The PDF has no extractable text (scanned?). Paste the abstract instead.")
    return text[:max_chars]


# ---------- tiny keyword extractor for the no-LLM fallback ----------
_STOP = set(
    "the a an and or of to in on for with is are was were be been this that these those it its as by from at into "
    "we our they their which can will also using use used based such than then over more most other not but if "
    "have has had how what when where while about between through each both some any all new one two".split()
)


def key_terms(text: str, k: int = 10) -> list[str]:
    words = re.findall(r"[A-Za-z][A-Za-z0-9+#_-]{3,}", text.lower())
    counts = Counter(w for w in words if w not in _STOP)
    return [w for w, _ in counts.most_common(k)]
