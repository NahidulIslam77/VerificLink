"""Defense-question generation and answer grading — LLM when configured, heuristic fallback otherwise.

The heuristic mode is a *demo fallback*: it rewards answers that are substantive and use concepts found in the
submitted material, but it cannot judge correctness. Credentials record which mode graded them, and heuristic
scores are capped (HEURISTIC_CAP) so they can never reach a perfect score.
"""
import logging

from . import llm
from .sources import key_terms

log = logging.getLogger("verificlink.grading")
HEURISTIC_CAP = 80


def _generic(kind: str, title: str) -> list[str]:
    if kind == "project":
        return [
            f"Describe the overall architecture of “{title}”: its main components, how data flows between them, and why you split it that way.",
            f"What was the hardest technical problem you hit while building “{title}”, and how exactly did you diagnose and solve it?",
            f"Name one significant trade-off you made in “{title}” (e.g. performance vs. simplicity) and what you would change with more time.",
        ]
    return [
        f"Summarise the core method of “{title}” and explain why it is better suited to the problem than the obvious baseline.",
        f"Which dataset, experiments or proofs support the main claim of “{title}”, and what are their limitations?",
        f"What was your own specific contribution to “{title}”, and which decision would you revisit now?",
    ]


def defense_questions(kind: str, title: str, material: str) -> tuple[list[dict], str]:
    """Returns ([{id, type, prompt, rubric, terms}], mode)."""
    terms = key_terms(material, 12)
    if llm.enabled():
        try:
            qs = llm.generate_defense_questions(kind, title, material)
            return [{"id": f"q{i + 1}", "type": "text", "prompt": q["prompt"], "rubric": q["rubric"], "terms": terms}
                    for i, q in enumerate(qs)], "ai"
        except Exception as exc:  # noqa: BLE001 — never block a user on an LLM hiccup
            log.warning("LLM question generation failed, using fallback: %s", exc)

    prompts = _generic(kind, title)
    what = "repository" if kind == "project" else "paper"
    for term in terms[:2]:
        prompts.append(f"Your {what} emphasises “{term}”. Explain concretely what role it plays and why you chose it over alternatives.")
    return [{"id": f"q{i + 1}", "type": "text", "prompt": p, "rubric": "", "terms": terms}
            for i, p in enumerate(prompts)], "heuristic"


def _heuristic_score(answer: str, terms: list[str]) -> dict:
    words = answer.split()
    if len(words) < 8:
        return {"score": 0, "feedback": "Answer too short to evaluate."}
    lowered = answer.lower()
    hits = sum(1 for t in terms if t in lowered)
    raw = 100 * (0.45 * min(1.0, len(words) / 70) + 0.55 * min(1.0, hits / 3))
    return {
        "score": min(HEURISTIC_CAP, round(raw)),
        "feedback": f"Heuristic check: {len(words)} words, referenced {hits} key concept(s) from your material.",
    }


def grade_text_answers(kind: str, title: str, material: str, questions: list[dict], answers: dict) -> tuple[list[dict], str]:
    qa = [{"prompt": q["prompt"], "rubric": q.get("rubric", ""), "answer": str(answers.get(q["id"], "")).strip()[:4000]}
          for q in questions]
    if llm.enabled() and any(x["answer"] for x in qa):
        try:
            graded = llm.grade_defense(kind, title, material, qa)
            for g, x in zip(graded, qa):
                if not x["answer"]:
                    g.update(score=0, feedback="No answer given.")
            return graded, "ai"
        except Exception as exc:  # noqa: BLE001
            log.warning("LLM grading failed, using heuristic: %s", exc)
    out = []
    for q, x in zip(questions, qa):
        out.append(_heuristic_score(x["answer"], q.get("terms", [])) if x["answer"]
                   else {"score": 0, "feedback": "No answer given."})
    return out, "heuristic"
