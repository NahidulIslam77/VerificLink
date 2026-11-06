# VerificLink — A Verified Professional & Academic Ecosystem

VerificLink is a full-stack platform built around a simple idea: **professional and academic achievements should be backed by evidence, not just claims on a profile.**

Instead of allowing users to list skills, projects, or research papers without proof, VerificLink requires them to go through server-graded assessments and verification processes. This gives recruiters a more reliable way to evaluate candidates, while helping applicants demonstrate what they can actually do.

## What We've Built

| Feature | Implementation |
|---|---|
| **Authentication & Profiles** | Secure JWT-based authentication with PBKDF2 password hashing. Supports separate candidate and company accounts, with editable profiles. |
| **Skill Verification** | Candidates complete a 15-minute MCQ assessment to verify their skills. The system includes 66 built-in questions covering 11 skills, with questions shuffled for each attempt. Other skills can be assessed using LLM-generated questions. Scores of 85% or above earn Expert status, while 60% or above earn Intermediate status. |
| **Cooldown After Failed Attempts** | Candidates must wait 30 minutes before attempting the same assessment again. This also applies to timeouts, abandoned attempts, and invalidated tests. |
| **Project Verification** | A 30-minute project defense checks GitHub repositories through the GitHub API. The repository must exist, must not be a fork, and the candidate must be its owner or a commit author. Repository information, including README content and programming languages, helps generate relevant questions. |
| **Research Verification** | A 30-minute research defense verifies papers through Crossref using their DOI. The candidate's surname must appear among the paper's authors. Candidates can also upload a PDF, from which the system extracts text for assessment. |
| **Dynamic Question Generation** | When an `ANTHROPIC_API_KEY` is configured, Claude generates questions and grading rubrics based on the submitted project or research paper. It also evaluates written answers. Without an API key, the system generates template-based questions using keywords and applies heuristic grading, capped at 80% and clearly labelled as heuristic-graded. |
| **Proctoring & Exam Monitoring** | Assessments require webcam access and fullscreen mode. The system monitors tab switching, window focus, fullscreen exits, clipboard actions, right-clicks, developer tools, additional displays, and camera interruptions. Face-count detection is supported in browsers that provide the `FaceDetector` API. Violations are recorded server-side, with a 5-point deduction per violation. More than eight violations invalidate the assessment. |
| **Credential Security** | Correct answers and grading rubrics remain on the server. Timers, penalties, and assessment results are also calculated server-side. Each issued credential is HMAC-signed and can be independently checked through its public verification page at `/verify/<id>`. |
| **Candidate Matching** | VerificLink calculates candidate-job compatibility using verified skills, coding alignment, and research relevance. The matching formula is `Score = (w_s × Skills + w_c × CodeAlignment + w_r × Research) / Σw`. Skill scores are averaged across the required skills. Code and research scores combine 65% defense performance with 35% TF-IDF-based relevance to the job description. Recruiters can adjust the weights for individual jobs. |
| **Recruiter Dashboard** | Companies can publish job openings, browse ranked candidates, examine score breakdowns, review credential signatures through an Audit Proof modal, and identify applicants. |
| **Candidate Job Board** | Candidates can explore job opportunities, view their personal match percentage, identify missing skills, and apply. At least one verified credential is required to apply. |

The goal is to make recruitment more evidence-based by connecting what candidates claim to what they can actually demonstrate.

